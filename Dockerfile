# Use lightweight Nginx alpine image
FROM nginx:alpine

# Copy custom Nginx configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy application static files
COPY index.html styles.css app.js README.md /usr/share/nginx/html/

# Expose HTTP port
EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
