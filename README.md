# project-manager

A small JSON HTTP API for managing projects and the tasks inside them (Node.js + Express, in-memory storage).

## Install

```sh
npm install
```

## Start the server

```sh
npm start            # listens on port 3000
PORT=8080 npm start  # custom port
```

The OpenAPI 3 contract is in `openapi.yaml` and served at `GET /openapi.json`.

## Run the tests

```sh
npm test
```

## Endpoints

| Method | Path | Success |
| --- | --- | --- |
| POST | `/projects` | 201 |
| GET | `/projects` | 200 |
| GET / PATCH / DELETE | `/projects/{projectId}` | 200 / 200 / 204 |
| POST | `/projects/{projectId}/tasks` | 201 |
| GET | `/projects/{projectId}/tasks?status=` | 200 |
| GET / PATCH / DELETE | `/projects/{projectId}/tasks/{taskId}` | 200 / 200 / 204 |
| GET | `/openapi.json` | 200 |

Invalid input returns `400 {"error": "..."}`; unknown projects or tasks return `404 {"error": "..."}`.

## Assumptions

- Node.js with Express; tests use `node:test` and global `fetch`.
- Storage is in memory and resets on restart; ids are UUIDs.
- Validation failures use 400 only. Unknown body fields are ignored.
- No authentication.
