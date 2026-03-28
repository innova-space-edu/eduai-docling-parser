FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y \
    curl \
    build-essential \
    nodejs \
    npm \
    && rm -rf /var/lib/apt/lists/*

# Instala docling
RUN pip install --no-cache-dir docling

COPY package.json ./
RUN npm install

COPY . .

EXPOSE 8080

CMD ["npm", "start"]