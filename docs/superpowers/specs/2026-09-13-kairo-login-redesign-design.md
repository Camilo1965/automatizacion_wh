# Diseño del acceso premium KAIRO

## Problema

La pantalla de acceso usa el contenedor del panel autenticado. En escritorio, ese contenedor reserva una columna de 16 rem para la barra lateral aunque la sesión no exista. El contenido del login queda limitado a esa columna, se desborda y se superpone.

## Solución

El acceso tendrá un `AuthShell` independiente, centrado en toda la ventana y sin dependencias del layout autenticado. Una superficie principal de máximo 1200 px combinará la presentación de marca y el formulario en dos columnas equilibradas. En tableta y móvil ambas zonas se apilarán sin desplazamiento horizontal.

La identidad conservará el logotipo original y usará espresso, mostaza KAIRO, marfil y blanco cálido. La marca comunicará el propósito del producto; el formulario mantendrá una jerarquía corta, campos amplios, contraseña visible bajo demanda, aviso de Bloq Mayús, error accesible y estado de envío.

## Contenido

- Mensaje de marca: “Tu negocio, organizado en un solo lugar”.
- Apoyo: “Gestiona conversaciones, pedidos, catálogo, envíos e inventario desde una sola operación.”
- Formulario: “Bienvenida a KAIRO”.
- Acción: “Entrar al panel”.

## Responsive y accesibilidad

- 390 px: una columna, marca compacta, formulario completo y sin scroll horizontal.
- 768 px: composición vertical centrada y con aire suficiente.
- Desde 896 px: composición de dos columnas sin superposición.
- Targets táctiles de al menos 44 px, foco visible, etiquetas programáticas y errores anunciados.
- Las transiciones respetarán `prefers-reduced-motion`.

## Validación

Se comprobarán 390×844, 768×1024, 1280×720, 1440×900 y 1915×900. El escenario automatizado medirá centrado, límites del viewport, ausencia de solapamiento y desbordamiento horizontal, además de ejecutar Axe.
