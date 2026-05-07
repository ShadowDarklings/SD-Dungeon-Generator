# AWS Deployment (Static MVP)

This project is static HTML/CSS/JS and can be deployed with either:

- AWS Amplify Hosting (simplest CI/CD), or
- S3 + CloudFront (manual but very transparent).

## Option 1: Amplify Hosting

1. Push repository to GitHub.
2. In AWS Console, open Amplify -> Host web app.
3. Connect GitHub repo and choose branch.
4. Build settings are minimal for static hosting:

```yaml
version: 1
frontend:
  phases:
    build:
      commands:
        - echo "Static site, no build step required"
  artifacts:
    baseDirectory: SD-Dungeon-Generator
    files:
      - '**/*'
  cache:
    paths: []
```

5. Deploy and verify that `index.html` loads and map interaction works.

## Option 2: S3 + CloudFront

1. Create S3 bucket for website content.
2. Upload entire `SD-Dungeon-Generator` directory contents.
3. Enable static website hosting or use CloudFront origin access.
4. Create CloudFront distribution targeting the bucket.
5. Set default root object to `index.html`.
6. Invalidate cache after updates.

## Recommended MVP Path

- Start client-only (generator, fog, and loot in browser memory).
- Add optional persistence later with API Gateway + Lambda + DynamoDB:
  - POST save game state
  - GET saved run by id/user
  - Store serialized dungeon state with set-array conversion
