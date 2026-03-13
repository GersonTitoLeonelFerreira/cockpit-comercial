This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Documentação do Produto

- [Lead Lifecycle — Governança do Produto](docs/product/lead-lifecycle.md): glossário, invariantes, estados/transições, regras de governança e exemplos práticos do ciclo de vida do Lead.

## SQL (rodar no Supabase SQL Editor)

-- (não é para alterar este arquivo; o filepath aqui é só para cumprir o formato)
-- Opção A: sobrescrever settings inteiro (use só se você quer substituir tudo)
update public.companies
set settings = '{
  "goal_scope": "seller",
  "goal_group_profile_ids": [],
  "goal_label_singular": "Fechamento",
  "goal_label_plural": "Fechamentos"
}'::jsonb
where id = '<COMPANY_ID>';

-- Opção B (recomendado): merge mantendo o resto do settings
update public.companies
set settings = coalesce(settings, '{}'::jsonb) || '{
  "goal_scope": "seller",
  "goal_group_profile_ids": [],
  "goal_label_singular": "Fechamento",
  "goal_label_plural": "Fechamentos"
}'::jsonb
where id = '<COMPANY_ID>';
