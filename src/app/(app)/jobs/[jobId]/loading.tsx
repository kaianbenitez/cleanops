// Replaces the client-side `loaded` flag the page used to carry. Next renders
// this while the server component's queries run, so navigating from the jobs
// list shows the dispatch layout's shape immediately instead of a blank screen.
export default function JobDetailLoading() {
  return (
    <div className="-mx-4 -mt-6 min-h-screen animate-pulse bg-[#f7f9f6] pb-10 sm:-mx-6 lg:-mx-8" aria-hidden>
      <div className="border-b border-[#d7e0d7] bg-[#fbfdf9]/95 px-5 py-3 sm:px-8">
        <div className="mx-auto flex max-w-[1500px] items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-[#e4eae3]" />
          <div className="h-5 w-40 rounded bg-[#e4eae3]" />
          <div className="h-6 w-24 rounded-full bg-[#e4eae3]" />
        </div>
      </div>

      <div className="mx-auto grid max-w-[1500px] gap-6 px-5 py-7 xl:grid-cols-[290px_minmax(0,1fr)_280px] sm:px-8">
        <div className="space-y-6">
          <div className="h-64 rounded-2xl border border-[#cad6ca] bg-white" />
          <div className="h-56 rounded-2xl border border-[#cad6ca] bg-white" />
        </div>
        <div className="space-y-6">
          <div className="h-48 rounded-2xl border border-[#cad6ca] bg-white" />
          <div className="h-72 rounded-2xl border border-[#cad6ca] bg-white" />
          <div className="h-40 rounded-2xl border border-[#cad6ca] bg-white" />
        </div>
        <div className="space-y-6">
          <div className="h-52 rounded-2xl border border-[#cad6ca] bg-white" />
          <div className="h-44 rounded-2xl border border-[#cad6ca] bg-white" />
        </div>
      </div>

      <span className="sr-only">Loading job details</span>
    </div>
  );
}
