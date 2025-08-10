# Usar la imagen oficial de Node.js 18 LTS
FROM node:18-alpine

# Establecer directorio de trabajo
WORKDIR /usr/src/app

# Copiar archivos de configuración de npm
COPY package*.json ./

# Instalar dependencias
RUN npm ci --only=production

# Copiar el código fuente
COPY web-server.js ./
COPY .env ./

# Crear usuario no-root para seguridad
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nodejs -u 1001

# Cambiar la propiedad de los archivos al usuario nodejs
RUN chown -R nodejs:nodejs /usr/src/app
USER nodejs

# Exponer el puerto
EXPOSE 8080

# Comando para ejecutar la aplicación
CMD ["node", "web-server.js"]
