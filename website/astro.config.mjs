import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";
import sitemap from "@astrojs/sitemap";

export default defineConfig({
  site: "https://synkro-website.vercel.app",
  integrations: [
    starlight({
      title: "Synkro",
      description:
        "Lightweight event-driven workflow orchestrator for Node.js. Define events, workflows, and state machines — backed by Redis or in-memory.",
      logo: {
        src: "./src/assets/mascot.svg",
      },
      favicon: "/favicon-32x32.png",
      social: {
        github: "https://github.com/buemura/synkro",
      },
      customCss: ["./src/styles/custom.css"],
      head: [
        // Favicon variants
        {
          tag: "link",
          attrs: {
            rel: "icon",
            type: "image/png",
            sizes: "16x16",
            href: "/favicon-16x16.png",
          },
        },
        {
          tag: "link",
          attrs: {
            rel: "icon",
            type: "image/png",
            sizes: "32x32",
            href: "/favicon-32x32.png",
          },
        },
        {
          tag: "link",
          attrs: {
            rel: "apple-touch-icon",
            sizes: "180x180",
            href: "/apple-touch-icon.png",
          },
        },
        // Open Graph
        {
          tag: "meta",
          attrs: {
            property: "og:image",
            content: "https://synkro-website.vercel.app/og-image.png",
          },
        },
        {
          tag: "meta",
          attrs: {
            property: "og:image:width",
            content: "1200",
          },
        },
        {
          tag: "meta",
          attrs: {
            property: "og:image:height",
            content: "630",
          },
        },
        {
          tag: "meta",
          attrs: {
            property: "og:image:alt",
            content:
              "Synkro - Event-driven workflow orchestrator for Node.js",
          },
        },
        // Twitter Card
        {
          tag: "meta",
          attrs: {
            name: "twitter:card",
            content: "summary_large_image",
          },
        },
        {
          tag: "meta",
          attrs: {
            name: "twitter:image",
            content: "https://synkro-website.vercel.app/og-image.png",
          },
        },
        // Additional SEO
        {
          tag: "meta",
          attrs: {
            name: "theme-color",
            content: "#0f0e17",
          },
        },
        {
          tag: "meta",
          attrs: {
            name: "keywords",
            content:
              "synkro, workflow orchestrator, event-driven, nodejs, redis, state machine, typescript, nestjs, nextjs, ai agents",
          },
        },
        // Fonts
        {
          tag: "link",
          attrs: {
            rel: "preconnect",
            href: "https://fonts.googleapis.com",
          },
        },
        {
          tag: "link",
          attrs: {
            rel: "preconnect",
            href: "https://fonts.gstatic.com",
            crossorigin: true,
          },
        },
        {
          tag: "link",
          attrs: {
            href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap",
            rel: "stylesheet",
          },
        },
      ],
      sidebar: [
        {
          label: "Getting Started",
          autogenerate: { directory: "getting-started" },
        },
        {
          label: "@synkro/core",
          collapsed: false,
          autogenerate: { directory: "core" },
        },
        {
          label: "@synkro/ui",
          autogenerate: { directory: "ui" },
        },
        {
          label: "@synkro/nestjs",
          autogenerate: { directory: "nestjs" },
        },
        {
          label: "@synkro/next",
          autogenerate: { directory: "next" },
        },
        {
          label: "@synkro/agents",
          autogenerate: { directory: "agents" },
        },
        {
          label: "Architecture",
          autogenerate: { directory: "architecture" },
        },
      ],
    }),
    sitemap(),
  ],
});
