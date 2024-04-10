FROM node:20.5.1-alpine
LABEL authors="Mitchell Reynolds <mitch@axesis.com.au>"

# Add tool which will fix init process
RUN apk add dumb-init
#RUN apt update && apt install dumb-init

# Create app directory
WORKDIR /usr/src/app

# Install app dependencies
COPY --chown=node:node . /usr/src/app
RUN mkdir  -p /usr/src/app/logs
RUN mkdir  -p /usr/src/app/sessions
RUN chown node:node /usr/src/app/logs

# Copy the environment file
COPY --chown=node:node .env.template /usr/src/app/.env

# Install only production dependencies
RUN npm ci --only=production

# friends don’t let friends run containers as root!
USER node

# Expose port 4000
EXPOSE 4000

CMD ["dumb-init", "node", "/usr/src/app/app.js" ]