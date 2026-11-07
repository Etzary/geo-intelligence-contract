# @geo-intelligence/contract

Paquete compartido por los repos `geo-intelligence-web` y `geo-intelligence-mobile`.
Contiene la **única fuente de verdad** del contrato de la API del backend:

- Tipos TypeScript y **esquemas Zod** de todo el contrato (auth, ficha médica, suscripciones y rutas públicas de emergencia).
- Un **cliente HTTP tipado** (`createApiClient`) con inyección de token, manejo central de errores y validación opcional de respuestas.
- **Handlers de MSW** (subpath `@geo-intelligence/contract/mocks`) para tests y desarrollo.

No contiene lógica de negocio, ni secretos, ni acceso a `/api/internal/*`.

## Uso como submódulo

```bash
# En geo-intelligence-web o geo-intelligence-mobile
git submodule add git@github.com:Etzary/geo-intelligence-contract.git packages/contract
```

En el `package.json` del consumidor, declara el submódulo como workspace y añádelo
como dependencia; así `npm install` lo enlaza y su `prepare` lo compila a `dist/`:

```json
{
  "workspaces": ["packages/contract"],
  "dependencies": {
    "@geo-intelligence/contract": "*"
  }
}
```

## Scripts

| Script | Descripción |
|---|---|
| `npm run build` | Compila a `dist/` (ESM + `.d.ts`). |
| `npm run dev` | Compila en modo watch. |
| `npm run typecheck` | `tsc --noEmit` sobre los fuentes. |
| `npm run clean` | Borra `dist/`. |

> El `prepare` ejecuta `build`, por lo que al instalar el paquete como dependencia local se compila automáticamente.
