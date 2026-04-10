# Lightweight nginx container for serving the Veda frontend SPA
FROM nginx:alpine

# Copy static files into nginx html directory
COPY . /usr/share/nginx/html

# Cloud Run requires port 8080
EXPOSE 8080

# Update nginx to listen on 8080 instead of 80
RUN sed -i 's/listen       80;/listen       8080;/' /etc/nginx/conf.d/default.conf && \
    sed -i 's/listen  \[::]:80;/listen  [::]:8080;/' /etc/nginx/conf.d/default.conf
