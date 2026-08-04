import { defineConfig } from 'tinacms';

export default defineConfig({
  branch: 'main',
  clientId: process.env.TINA_CLIENT_ID || 'placeholder-client-id',
  token: process.env.TINA_TOKEN || 'placeholder-token',
  build: {
    outputFolder: 'admin',
    publicFolder: 'public',
  },
  media: {
    tina: {
      mediaRoot: 'uploads',
      publicFolder: 'public',
    },
  },
  schema: {
    collections: [
      {
        name: 'grammar',
        label: 'Grammar',
        path: 'content/grammar',
        format: 'mdx',
        fields: [
          { type: 'string', name: 'title', label: 'Title', isTitle: true, required: true },
          { type: 'string', name: 'level', label: 'JLPT Level', required: true },
          { type: 'string', name: 'meaning', label: 'Meaning', required: true },
          { type: 'rich-text', name: 'body', label: 'Body', required: true },
        ],
      },
    ],
  },
});
