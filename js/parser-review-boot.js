import { bootPage } from "./core/page-boot.js";

export async function bootParserReviewPage() {
  const runtime = await bootPage({
    roles: ["teacher", "admin"],
    nav: {
      title: "Review Questions",
      preset: "teacherCreate",
      back: "exam-creator.html",
    },
  });

  if (runtime && typeof window.renderParserReview === "function") {
    window.renderParserReview();
  }

  return runtime;
}

bootParserReviewPage();
