# WhatsLead Cloud POS - Production Enterprise Container
# Zero-dependency, lightweight, high-performance Alpine image
FROM python:3.11-alpine

WORKDIR /app

# Create unprivileged service user for security
RUN addgroup -S posgroup && adduser -S posuser -G posgroup

# Copy application files
COPY server.py ./
COPY manage_tenants.py ./
COPY public/ ./public/
COPY data/ ./data/

# Set file permissions for data persistence
RUN chown -R posuser:posgroup /app

USER posuser

# Port 3000 exposed for LAN and Cloud Terminals
EXPOSE 3000

ENV PYTHONUNBUFFERED=1

# Run the enterprise threaded server
CMD ["python3", "server.py"]
