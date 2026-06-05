#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"

: "${AWS_REGION:?Set AWS_REGION, for example ap-south-1}"
: "${ACCOUNT_ID:?Set ACCOUNT_ID to your AWS account ID}"
: "${ECR_REPOSITORY:=ordanex-api}"
: "${IMAGE_TAG:=prod-$(date +%Y%m%d-%H%M%S)}"

if ! command -v aws >/dev/null 2>&1; then
  echo "aws CLI is required."
  exit 1
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "docker is required."
  exit 1
fi

ECR_URI="${ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/${ECR_REPOSITORY}"

echo "Ensuring ECR repository ${ECR_REPOSITORY} exists..."
if ! aws ecr describe-repositories --repository-names "${ECR_REPOSITORY}" --region "${AWS_REGION}" >/dev/null 2>&1; then
  aws ecr create-repository --repository-name "${ECR_REPOSITORY}" --region "${AWS_REGION}" >/dev/null
fi

echo "Logging Docker into ECR..."
aws ecr get-login-password --region "${AWS_REGION}" | docker login --username AWS --password-stdin "${ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com"

echo "Building backend image..."
docker build -t "${ECR_REPOSITORY}:${IMAGE_TAG}" -f "${BACKEND_DIR}/Dockerfile" "${BACKEND_DIR}"

echo "Tagging image..."
docker tag "${ECR_REPOSITORY}:${IMAGE_TAG}" "${ECR_URI}:${IMAGE_TAG}"
docker tag "${ECR_REPOSITORY}:${IMAGE_TAG}" "${ECR_URI}:latest"

echo "Pushing image tags ${IMAGE_TAG} and latest..."
docker push "${ECR_URI}:${IMAGE_TAG}"
docker push "${ECR_URI}:latest"

cat <<EOF

Backend image pushed successfully.

Image tag: ${IMAGE_TAG}
Image URI: ${ECR_URI}:${IMAGE_TAG}

Next:
  export IMAGE_TAG=${IMAGE_TAG}
  ./deploy/production/register_ecs_task_definitions.sh
  ./deploy/production/update_ecs_services.sh
EOF
