import Link from "next/link";
import { use } from "react";
import { notFound } from "next/navigation";
import { blogPosts } from "@/data/blog-posts";

export function generateStaticParams() {
  return blogPosts.map((post) => ({ slug: post.slug }));
}

export const dynamicParams = true;

export default function BlogPostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const decodedSlug = decodeURIComponent(slug).trim();
  const post = blogPosts.find((item) => item.slug === decodedSlug);

  if (!post) {
    notFound();
  }

  return (
    <div className="min-h-screen bg-mariner text-slate-900 dark:text-slate-100">
      <article className="max-w-3xl mx-auto px-6 pt-16 pb-20">
        <Link href="/blog" className="text-sm text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-slate-100">
          Back to blog
        </Link>
        <div className="mt-6">
          <p className="text-xs uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">{post.category}</p>
          <h1 className="text-3xl sm:text-4xl font-display mt-3 text-slate-900 dark:text-slate-100">{post.title}</h1>
          <div className="text-xs text-slate-500 dark:text-slate-400 mt-3 flex items-center gap-3">
            <span>{post.date}</span>
            <span aria-hidden="true">·</span>
            <span>{post.readTime}</span>
          </div>
        </div>

        {/* Hero image */}
        <figure className="mt-8">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={post.heroImage.src}
            alt={post.heroImage.alt}
            className="w-full rounded-2xl border border-slate-200/70 shadow-lg"
          />
        </figure>

        <div className="mt-10 space-y-10">
          {post.sections.map((section) => (
            <section key={section.heading ?? section.paragraphs[0]}>
              {section.heading && (
                <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100 mb-3">{section.heading}</h2>
              )}
              <div className="space-y-4">
                {section.paragraphs.map((paragraph) => (
                  <p key={paragraph} className="text-slate-700 dark:text-slate-300 leading-relaxed">
                    {paragraph}
                  </p>
                ))}
              </div>
              {section.image && (
                <figure className="mt-6">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={section.image.src}
                    alt={section.image.alt}
                    className="w-full rounded-xl border border-slate-200/70 shadow"
                  />
                  {section.image.caption && (
                    <figcaption className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                      {section.image.caption}
                    </figcaption>
                  )}
                </figure>
              )}
              {section.bullets && (
                <ul className="mt-4 space-y-2 text-slate-700 dark:text-slate-300 list-disc list-inside">
                  {section.bullets.map((bullet) => (
                    <li key={bullet}>{bullet}</li>
                  ))}
                </ul>
              )}
            </section>
          ))}
        </div>

        <div className="mt-12 border-t border-slate-200/70 pt-6">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Sources</h3>
          <ul className="mt-3 space-y-2 text-sm text-slate-600 dark:text-slate-300">
            {post.sources.map((source) => (
              <li key={source}>
                <a
                  href={source}
                  target="_blank"
                  rel="noopener"
                  className="underline decoration-slate-300 underline-offset-4 hover:text-slate-900 dark:hover:text-white"
                >
                  {source}
                </a>
              </li>
            ))}
          </ul>
        </div>
      </article>
    </div>
  );
}
