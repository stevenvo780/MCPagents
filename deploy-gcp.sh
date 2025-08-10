#!/bin/bash

# Script de despliegue para Google Cloud Platform
# Proyecto: emergent-enter-prices

set -e  # Salir en caso de error

# Configuración
PROJECT_ID="emergent-enter-prices"
SERVICE_NAME="mcp-autonomous-service"
REGION="us-central1"
IMAGE_NAME="gcr.io/${PROJECT_ID}/${SERVICE_NAME}"

echo "🚀 Iniciando despliegue de MCP Autonomous Service..."

# Verificar que gcloud esté instalado
if ! command -v gcloud &> /dev/null; then
    echo "❌ Google Cloud SDK no está instalado. Instálalo desde: https://cloud.google.com/sdk/docs/install"
    exit 1
fi

# Configurar proyecto
echo "📋 Configurando proyecto GCP..."
gcloud config set project $PROJECT_ID

# Habilitar APIs necesarias
echo "🔧 Habilitando APIs necesarias..."
gcloud services enable cloudbuild.googleapis.com
gcloud services enable run.googleapis.com
gcloud services enable containerregistry.googleapis.com

# Instalar dependencias
echo "📦 Instalando dependencias..."
npm install

# Construir imagen Docker
echo "🏗️  Construyendo imagen Docker..."
docker build -t $SERVICE_NAME .

# Etiquetar para Container Registry
echo "🏷️  Etiquetando imagen para Container Registry..."
docker tag $SERVICE_NAME $IMAGE_NAME

# Configurar Docker para usar gcloud como helper de credenciales
echo "🔐 Configurando autenticación Docker..."
gcloud auth configure-docker

# Subir imagen a Container Registry
echo "⬆️  Subiendo imagen a Container Registry..."
docker push $IMAGE_NAME

# Desplegar en Cloud Run
echo "🚀 Desplegando en Cloud Run..."
gcloud run deploy $SERVICE_NAME \
    --image $IMAGE_NAME \
    --platform managed \
    --region $REGION \
    --allow-unauthenticated \
    --port 8080 \
    --memory 512Mi \
    --cpu 1 \
    --min-instances 0 \
    --max-instances 10 \
    --set-env-vars="NODE_ENV=production" \
    --timeout 300

# Obtener URL del servicio
echo "✅ Despliegue completado!"
SERVICE_URL=$(gcloud run services describe $SERVICE_NAME --platform managed --region $REGION --format 'value(status.url)')
echo "🌐 URL del servicio: $SERVICE_URL"
echo "🏥 Health check: $SERVICE_URL/health"
echo "📡 API endpoints:"
echo "   - POST $SERVICE_URL/api/ask"
echo "   - POST $SERVICE_URL/api/analyze"
echo "   - POST $SERVICE_URL/jsonrpc"

echo ""
echo "🎉 ¡Servicio MCP Autonomous desplegado exitosamente en GCP!"
