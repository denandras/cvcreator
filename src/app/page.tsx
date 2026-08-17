import Link from "next/link";

export default function Home() {
  return (
    <main className="h-full overflow-y-auto flex flex-col items-center justify-center p-8">
      <div className="max-w-2xl w-full text-center space-y-6">
        <h1 className="text-4xl font-bold tracking-tight text-gray-900">
          CV Creator
        </h1>
        <p className="text-lg text-gray-600">
          Build polished, professional CVs with live preview, multilingual
          support, and PDF export.
        </p>
        <div className="flex gap-4 justify-center pt-4">
          <Link
            href="/editor"
            className="rounded-lg bg-teal-600 px-6 py-3 text-white font-medium hover:bg-teal-700 transition-colors"
          >
            Get Started
          </Link>
          <Link
            href="/demo"
            className="rounded-lg border border-gray-300 px-6 py-3 font-medium hover:bg-gray-100 transition-colors"
          >
            Try Demo
          </Link>
        </div>
      </div>
    </main>
  );
}