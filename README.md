# Symphony Finance Subgraph

## Development

```bash
# copy env and adjust its content
# you can get an access token from https://thegraph.com/explorer/dashboard
cp .env.test .env
# install project dependencies
npm i
# run codegen
npm run subgraph:codegen

```

## Deployment

To be able to deploy the subgraph in any environment for any network first we will need to prepare the local env:

- compile the subgraph

```
npm run prepare
```

- Before any deployment you need to generate the types and schemas:

```
npm run subgraph:codegen
```

To be able to deploy you will need to create a .env file and add `ACCESS_TOKEN` environment variable.

```
// For Polygon Mainnet:
npm run deploy:polygon

// For Mumbai testnet:
npm run deploy:mumbai
```
