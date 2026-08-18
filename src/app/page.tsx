import Link from "next/link";

export default function Home() {
  return (
    <main className="h-full overflow-y-auto flex flex-col items-center justify-center p-4 sm:p-8 bg-gradient-to-br from-teal-50/30 via-gray-50 to-gray-100">
      <div className="max-w-2xl w-full text-center space-y-8 sm:space-y-10">
        {/* Hero badge */}
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-teal-50 border border-teal-200 text-teal-700 text-sm font-medium">
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
          </svg>
          Free multilingual CV builder
        </div>

        <div className="space-y-4">
          <h1 className="text-4xl sm:text-5xl sm:text-6xl font-bold tracking-tight text-gray-900">
            Create your{" "}
            <span className="text-teal-600">CV</span>
            <br className="sm:hidden" />
            {" "}with confidence
          </h1>
          <p className="text-base sm:text-lg text-gray-500 max-w-md mx-auto leading-relaxed">
            Build polished, professional CVs with live preview, multilingual
            support, and one-click PDF export.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
          <Link
            href="/signup"
            className="rounded-xl bg-teal-600 px-8 py-3.5 text-white font-semibold hover:bg-teal-700 transition-all shadow-sm hover:shadow-md"
          >
            Get Started — Sign Up
          </Link>
          <Link
            href="/signin"
            className="rounded-xl border border-gray-300 px-8 py-3.5 font-semibold text-gray-700 hover:bg-white hover:border-gray-400 transition-all bg-white/50"
          >
            Sign In
          </Link>
        </div>

        <div className="pt-2">
          <p className="text-sm text-gray-400 mb-2">Just want to look around?</p>
          <Link
            href="/demo"
            className="inline-flex items-center gap-1.5 text-teal-600 hover:text-teal-700 font-medium underline-offset-2 hover:underline"
          >
            Try Demo Mode
            <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </Link>
        </div>

        {/* Feature highlights */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-8 max-w-lg mx-auto">
          {[
            { icon: "M3 5h12M3 12h18M3 19h18", label: "Live Preview" },
            { icon: "M12 6v6m0 0v6m0-6h6m-6 0H6", label: "Multilingual" },
            { icon: "M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z", label: "PDF Export" },
          ].map((f) => (
            <div key={f.label} className="flex flex-col items-center gap-2 text-gray-500">
              <svg className="w-6 h-6 text-teal-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d={f.icon} />
              </svg>
              <span className="text-sm font-medium">{f.label}</span>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}