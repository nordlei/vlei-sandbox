# Integration test suite using signify-ts

## How to run


The most straight forward way to run the integration test suite is to run a container using the compose `test` service:

```bash
docker compose run --build --rm test
```

To run a specific test file:

```bash
docker compose run --rm --build test npm start src/issues/contact-not-added-after-deletion.test.ts
```

You can also run the test outside of the docker environment. First, you need to expose the ports for keria.

```bash
cp docker-compose.override-sample.yaml docker-compose.override.yaml
```

Then run the test using npm

```bash
npm start
```

Or

```bash
npm run dev
```
