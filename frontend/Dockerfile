FROM node:20-alpine AS builder
WORKDIR /app

ARG REACT_APP_API_URL
ARG REACT_APP_SIGNALING_URL
ENV REACT_APP_API_URL=$REACT_APP_API_URL
ENV REACT_APP_SIGNALING_URL=$REACT_APP_SIGNALING_URL

COPY package*.json ./
RUN npm ci

COPY public ./public
COPY src ./src
RUN npm run build

# Production: serve with nginx
FROM nginx:alpine AS runner
COPY --from=builder /app/build /usr/share/nginx/html
COPY nginx-react.conf /etc/nginx/conf.d/default.conf

EXPOSE 3000
CMD ["nginx", "-g", "daemon off;"]
