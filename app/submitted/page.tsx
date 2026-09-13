import Link from "next/link";

export const metadata = { title: "Thanks" };

export default function Submitted() {
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-5 text-center">
      <p className="text-4xl" aria-hidden>
        🎉
      </p>
      <h1 className="mt-4 text-2xl font-bold tracking-tight">Thanks — got it</h1>
      <p className="mt-2 text-neutral-600">
        We&apos;ll verify the address and add it to the map. Usually within a few days.
      </p>
      <Link
        href="/"
        className="mt-6 rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800"
      >
        Back to the map
      </Link>
    </div>
  );
}
