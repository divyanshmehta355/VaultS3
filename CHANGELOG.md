# Changelog

All notable changes to the VaultS3 project are documented in this file.

## [v1.0.0] - Initial Release

### Features Added
- **Modern Minimalist UI**: Built with Next.js App Router and Tailwind CSS, featuring glassmorphism elements, dynamic micro-animations, and responsive layouts.
- **List & Grid Views**: Added a seamless toggle to switch between a spacious grid view and a condensed list view for browsing files.
- **Authentication**: Route-level protection via Next.js Middleware and JWT cookies, ensuring only authorized users with the `APP_PASSWORD` can access the dashboard.
- **S3 / Minio Integration**: Fully integrated with `@aws-sdk/client-s3` with `forcePathStyle` to support self-hosted Minio instances.
- **Large File Support (Multipart Uploads)**: 
  - Implemented 5MB chunked multipart uploads via a custom Next.js backend proxy.
  - Uploads bypass Minio CORS limitations natively.
  - Supports uploading multiple files concurrently using `Promise.all` batching for maximum speed.
- **Virtual Folders**: 
  - Simulated directory trees using S3 Prefixes.
  - Supports creating folders and navigating via dynamic breadcrumbs.
  - Supports recursive folder deletion (wiping all contents in one click).
- **Core File Actions**: 
  - **Rename**: Copies the object to a new key and deletes the old one. Hides the UUID backend-prefix cleanly from the UI.
  - **Delete**: Instant optimistic UI deletion followed by backend synchronization.
  - **Preview**: In-browser preview support for images, videos, and PDFs.
  - **Share**: Generates 7-day presigned S3 URLs for sharing files publicly.
  - **Download**: Direct file downloads via proxy/presigned URLs.
- **Search & Sort**: Real-time client-side filtering and sorting by Newest, Oldest, Largest, and Smallest.

### Technical Achievements
- Successfully bypassed complex S3 CORS requirements by developing a chunk-proxy architecture within Next.js API routes.
- Built a highly optimized React state tree using Optimistic UI updates to make renaming and deleting files feel instantaneous.
