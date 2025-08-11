# Usar Node.js 22 Alpine para mejor seguridad
FROM node:22-alpine

# Establecer directorio de trabajo
WORKDIR /usr/src/app

# Copiar archivos de configuración de npm
COPY package*.json ./

# Instalar dependencias (todas para poder compilar)
RUN npm ci

# Copiar código fuente TypeScript y configuración
COPY src/ ./src/
COPY tsconfig.json ./

# Compilar TypeScript a JavaScript
RUN npm run build

# Limpiar dependencias de desarrollo para reducir tamaño
RUN npm ci --only=production && npm cache clean --force

# Crear usuario no-root para seguridad
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Cambiar la propiedad de los archivos al usuario nodejs
RUN chown -R nodejs:nodejs /usr/src/app
USER nodejs

# Exponer el puerto
EXPOSE 8080

# Comando para ejecutar la aplicación
CMD ["node", "dist/web-server.js"]
