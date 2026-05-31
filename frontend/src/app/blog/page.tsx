import Link from "next/link";
import { blogPosts } from "@/data/blog-posts";

export default function BlogPage() {
  return (
    <div className="min-h-screen bg-mariner text-slate-900 dark:text-slate-100">
      <header className="max-w-6xl mx-auto px-6 pt-16 pb-10">
        <span className="text-xs uppercase tracking-[0.3em] text-slate-500 dark:text-slate-400">Blog</span>
        <h1 className="text-3xl sm:text-4xl font-display mt-2 text-slate-900 dark:text-slate-100">Supply chain field notes</h1>
        <p className="text-slate-600 dark:text-slate-300 max-w-2xl mt-3">
          Incidents, guides, and practical lessons from the open source ecosystem.
        </p>
      </header>

      <main className="max-w-6xl mx-auto px-6 pb-20">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {blogPosts.map((post) => (
            <Link
              key={post.slug}
              href={`/blog/${post.slug}`}
              className="sw-card p-6 hover:-translate-y-1 transition-all"
            >
              <p className="text-xs uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">{post.category}</p>
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mt-3 mb-2">{post.title}</h2>
              <p className="text-sm text-slate-600 dark:text-slate-300 mb-4">{post.excerpt}</p>
              <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center justify-between">
                <span>{post.date}</span>
                <span>{post.readTime}</span>
              </div>
            </Link>
          ))}
        </div>
      </main>
    </div>
  );
}
