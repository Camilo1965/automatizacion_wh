/**
 * Minimal S3-compatible client (Put/Get/List/Delete) using SigV4 + fetch.
 * Separate from application media storage credentials.
 */
import { createHash, createHmac } from 'node:crypto';

function sha256Hex(data) {
  return createHash('sha256').update(data).digest('hex');
}

function hmac(key, data) {
  return createHmac('sha256', key).update(data).digest();
}

function amzDate(date) {
  const iso = date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  return { amz: iso, short: iso.slice(0, 8) };
}

function encodePath(key) {
  return key
    .split('/')
    .map((seg) => encodeURIComponent(seg).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`))
    .join('/');
}

function signingKey(secret, shortDate, region, service) {
  const kDate = hmac(`AWS4${secret}`, shortDate);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, service);
  return hmac(kService, 'aws4_request');
}

/**
 * @param {object} cfg
 * @param {string} cfg.endpoint
 * @param {string} cfg.bucket
 * @param {string} cfg.region
 * @param {string} cfg.accessKeyId
 * @param {string} cfg.secretAccessKey
 * @param {boolean} [cfg.forcePathStyle]
 * @param {typeof fetch} [cfg.fetchImpl]
 */
export function createBackupS3Client(cfg) {
  const fetchImpl = cfg.fetchImpl ?? globalThis.fetch;
  const endpoint = new URL(cfg.endpoint);
  const forcePathStyle = cfg.forcePathStyle !== false;

  function objectUrl(key) {
    if (forcePathStyle) {
      const base = endpoint.href.replace(/\/$/, '');
      return `${base}/${cfg.bucket}/${encodePath(key)}`;
    }
    const host = `${cfg.bucket}.${endpoint.host}`;
    return `${endpoint.protocol}//${host}/${encodePath(key)}`;
  }

  async function signedRequest({ method, key, body, contentType, query = '' }) {
    const url = new URL(objectUrl(key));
    if (query) {
      url.search = query.startsWith('?') ? query : `?${query}`;
    }
    const now = new Date();
    const { amz, short } = amzDate(now);
    const payload = body ?? Buffer.alloc(0);
    const payloadHash = sha256Hex(payload);
    const host = url.host;
    const canonicalUri = url.pathname;
    const canonicalQuery = [...url.searchParams.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .join('&');

    const headers = {
      host,
      'x-amz-content-sha256': payloadHash,
      'x-amz-date': amz,
    };
    if (contentType) headers['content-type'] = contentType;
    if (payload.length > 0) headers['content-length'] = String(payload.length);

    const signedHeaderNames = Object.keys(headers)
      .map((h) => h.toLowerCase())
      .sort();
    const signedHeaders = signedHeaderNames.join(';');
    const canonicalHeaders = signedHeaderNames
      .map((name) => `${name}:${headers[name]}\n`)
      .join('');

    const canonicalRequest = [
      method,
      canonicalUri,
      canonicalQuery,
      canonicalHeaders,
      signedHeaders,
      payloadHash,
    ].join('\n');

    const credentialScope = `${short}/${cfg.region}/s3/aws4_request`;
    const stringToSign = [
      'AWS4-HMAC-SHA256',
      amz,
      credentialScope,
      sha256Hex(canonicalRequest),
    ].join('\n');

    const signature = createHmac('sha256', signingKey(cfg.secretAccessKey, short, cfg.region, 's3'))
      .update(stringToSign)
      .digest('hex');

    headers.authorization = `AWS4-HMAC-SHA256 Credential=${cfg.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

    const res = await fetchImpl(url, {
      method,
      headers,
      body: method === 'GET' || method === 'HEAD' || method === 'DELETE' ? undefined : payload,
    });
    return res;
  }

  return {
    async putObject(key, bytes, contentType = 'application/octet-stream') {
      const res = await signedRequest({
        method: 'PUT',
        key,
        body: Buffer.from(bytes),
        contentType,
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`S3 PutObject ${res.status}: ${text.slice(0, 200)}`);
      }
    },

    async getObject(key) {
      const res = await signedRequest({ method: 'GET', key });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`S3 GetObject ${res.status}: ${text.slice(0, 200)}`);
      }
      return Buffer.from(await res.arrayBuffer());
    },

    async deleteObject(key) {
      const res = await signedRequest({ method: 'DELETE', key });
      if (!res.ok && res.status !== 404) {
        const text = await res.text().catch(() => '');
        throw new Error(`S3 DeleteObject ${res.status}: ${text.slice(0, 200)}`);
      }
    },

    async listObjectKeys(prefix = '') {
      const keys = [];
      let token = undefined;
      do {
        const params = new URLSearchParams({ 'list-type': '2' });
        if (prefix) params.set('prefix', prefix);
        if (token) params.set('continuation-token', token);
        // List is bucket-root; use empty key path quirk via signedRequest on ''
        const res = await signedBucketList(params.toString());
        if (!res.ok) {
          const text = await res.text().catch(() => '');
          throw new Error(`S3 ListObjects ${res.status}: ${text.slice(0, 200)}`);
        }
        const xml = await res.text();
        for (const m of xml.matchAll(/<Key>([^<]+)<\/Key>/g)) {
          keys.push(decodeXml(m[1]));
        }
        const truncated = /<IsTruncated>true<\/IsTruncated>/i.test(xml);
        const next = xml.match(/<NextContinuationToken>([^<]+)<\/NextContinuationToken>/);
        token = truncated && next ? decodeXml(next[1]) : undefined;
      } while (token);
      return keys;
    },
  };

  async function signedBucketList(query) {
    const now = new Date();
    const { amz, short } = amzDate(now);
    const listUrl = forcePathStyle
      ? new URL(`${endpoint.href.replace(/\/$/, '')}/${cfg.bucket}?${query}`)
      : new URL(`${endpoint.protocol}//${cfg.bucket}.${endpoint.host}/?${query}`);

    const payloadHash = sha256Hex('');
    const host = listUrl.host;
    const canonicalUri = listUrl.pathname || '/';
    const canonicalQuery = [...listUrl.searchParams.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .join('&');

    const headers = {
      host,
      'x-amz-content-sha256': payloadHash,
      'x-amz-date': amz,
    };
    const signedHeaderNames = Object.keys(headers).sort();
    const signedHeaders = signedHeaderNames.join(';');
    const canonicalHeaders = signedHeaderNames
      .map((name) => `${name}:${headers[name]}\n`)
      .join('');
    const canonicalRequest = [
      'GET',
      canonicalUri,
      canonicalQuery,
      canonicalHeaders,
      signedHeaders,
      payloadHash,
    ].join('\n');
    const credentialScope = `${short}/${cfg.region}/s3/aws4_request`;
    const stringToSign = [
      'AWS4-HMAC-SHA256',
      amz,
      credentialScope,
      sha256Hex(canonicalRequest),
    ].join('\n');
    const signature = createHmac('sha256', signingKey(cfg.secretAccessKey, short, cfg.region, 's3'))
      .update(stringToSign)
      .digest('hex');
    headers.authorization = `AWS4-HMAC-SHA256 Credential=${cfg.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
    return fetchImpl(listUrl, { method: 'GET', headers });
  }
}

function decodeXml(value) {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}
