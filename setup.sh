#!/bin/bash

echo "=================================="
echo "Email Marketing Tool - Setup"
echo "=================================="
echo ""

# Check if Docker is installed
if command -v docker &> /dev/null; then
    echo "✓ Docker found"
else
    echo "✗ Docker not found. Please install Docker first."
    exit 1
fi

# Check if Docker Compose is installed
if command -v docker-compose &> /dev/null; then
    echo "✓ Docker Compose found"
else
    echo "✗ Docker Compose not found. Please install Docker Compose first."
    exit 1
fi

echo ""
echo "Setting up environment..."

# Create .env file if it doesn't exist
if [ ! -f .env ]; then
    echo "Creating .env file..."
    cp .env.example .env

    # Generate secure JWT secret
    JWT_SECRET=$(openssl rand -base64 32)

    # Update .env with generated secret
    if [[ "$OSTYPE" == "darwin"* ]]; then
        sed -i '' "s/change-this-to-a-secure-random-string-min-32-chars/$JWT_SECRET/" .env
    else
        sed -i "s/change-this-to-a-secure-random-string-min-32-chars/$JWT_SECRET/" .env
    fi

    echo "✓ Environment file created with secure JWT secret"
else
    echo "✓ .env file already exists"
fi

# Create necessary directories
echo ""
echo "Creating directories..."
mkdir -p backend/data backend/logs nginx/ssl

echo "✓ Directories created"

# SSL certificate setup
echo ""
echo "Do you want to generate a self-signed SSL certificate for testing? (y/n)"
read -r response

if [[ "$response" =~ ^([yY][eE][sS]|[yY])$ ]]; then
    echo "Generating self-signed SSL certificate..."
    openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
        -keyout nginx/ssl/privkey.pem \
        -out nginx/ssl/fullchain.pem \
        -subj "/CN=marketing.myndsolution.com" 2>/dev/null
    echo "✓ SSL certificate generated"
else
    echo "Skipping SSL generation. Remember to add your certificates to nginx/ssl/"
fi

echo ""
echo "=================================="
echo "Setup complete!"
echo "=================================="
echo ""
echo "To start in development mode:"
echo ""
echo "  Terminal 1 - Backend:"
echo "  $ cd backend && npm install && npm run dev"
echo ""
echo "  Terminal 2 - Frontend:"
echo "  $ cd frontend && npm install && npm run dev"
echo ""
echo "  Access: http://localhost:5173"
echo ""
echo "To start with Docker:"
echo ""
echo "  $ docker-compose up -d"
echo "  Access: https://marketing.myndsolution.com"
echo ""
echo "Default credentials:"
echo "  Username: admin"
echo "  Password: changeme123"
echo ""
echo "=================================="
