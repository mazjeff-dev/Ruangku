FROM node:22-alpine AS build

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
ARG VITE_API_URL=http://localhost:3000/api/v1
ENV VITE_API_URL=${VITE_API_URL}
RUN npm run build

FROM node:22-alpine

WORKDIR /app
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000

COPY --from=build /app/build ./build
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json

EXPOSE 3000
CMD ["node", "build"]
