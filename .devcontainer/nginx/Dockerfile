FROM nginx:stable
ARG HT_USER=testuser
ARG HT_PASS=testpass

RUN apt-get update \
  && apt-get install -y apache2-utils \
  && rm -rf /var/lib/apt/lists/* \
  && htpasswd -Bbn "$HT_USER" "$HT_PASS" > /etc/nginx/htpasswd

COPY nginx.conf /etc/nginx/nginx.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
