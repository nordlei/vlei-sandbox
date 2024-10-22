# Integration test suite using signify-ts

## How to run

### Docker

The most straight forward way to run the integration test suite is to run a container using the compose `test` service:

```bash
docker compose run --build --rm test
```

To run a specific test file:

```bash
docker compose run --rm --build test src/issues/contact-not-added-after-deletion.test.ts
```

### NPM

Install all dependencies

```bash
npm i
```

Expose the ports for keria via a local override.

```bash
cp docker-compose.override-sample.yaml docker-compose.override.yaml
```

And then start all containers

```bash
docker compose up -d keria
```

Then run the test using npm

```bash
npm start
```

Or

```bash
npm run dev
```
