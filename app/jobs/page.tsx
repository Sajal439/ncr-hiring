import type { Metadata } from "next";
import { allJobs } from "@/lib/data";
import { JobsBoard } from "./JobsBoard";
import { SubscribeCard } from "@/components/SubscribeCard";

export const metadata: Metadata = {
  title: "Jobs in Delhi NCR",
  description:
    "Every open role at startups hiring in Gurugram, Noida and Delhi — filter by function, seniority, salary and how recently it was posted.",
  alternates: { canonical: "/jobs" },
};

export default function JobsPage() {
  return (
    <>
      <JobsBoard jobs={allJobs} />
      <SubscribeCard enabled={!!process.env.SUBSCRIBERS_URL} />
    </>
  );
}
