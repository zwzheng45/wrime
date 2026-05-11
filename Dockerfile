FROM node:20.4.0-bookworm AS builder

ARG ENABLE_LOGGING=ON

ENV ENABLE_LOGGING=${ENABLE_LOGGING}

# Install tools and dependencies
RUN apt update && apt install -y \
    cmake \
    git-lfs \
    ninja-build \
    libboost-dev \
    libboost-regex-dev \
    libyaml-cpp-dev \
    libleveldb-dev \
    libmarisa-dev \
    libopencc-dev

# Set up Emscripten
RUN git clone https://github.com/emscripten-core/emsdk.git && \
    cd emsdk && \
    ./emsdk install latest && \
    ./emsdk activate latest

COPY / /my_rime
WORKDIR /my_rime

RUN git lfs install --force && git lfs pull

# Install pnpm and dev dependencies
RUN npm i -g pnpm@9.15.9 && \
    pnpm i

# Get submodules and font
RUN pnpm run submodule && \
    pnpm run font

# Build WASM
RUN export PATH="$PATH:/emsdk/upstream/emscripten" && \
    pnpm run native && \
    pnpm run schema && \
    pnpm run lib && \
    pnpm run wasm

# Build webapp
ARG LIBRESERVICE_CDN=
ARG RIME_CDN=
ENV LIBRESERVICE_CDN=${LIBRESERVICE_CDN}
ENV RIME_CDN=${RIME_CDN}
RUN pnpm run build


FROM nginx:1.25.1-alpine-slim

COPY --from=builder /my_rime/dist /usr/share/nginx/html
