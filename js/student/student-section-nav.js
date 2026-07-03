/**
 * Sticky section jump navigation for the student dashboard.
 */

const SECTION_LINKS = [
  { id: "availableExamsSection", label: "Exams" },
  { id: "topicNotesSection", label: "Notes" },
  { id: "learningIntelligenceSection", label: "Insights" },
  { id: "myProgressSection", label: "Progress" },
  { id: "recentAttemptsSection", label: "History" },
];

function escapeHTML(value = "") {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * @param {HTMLElement|null} container
 */
export function renderStudentSectionNav(container) {
  if (!container) {
    return;
  }

  container.innerHTML = `
    <nav class="student-section-nav" aria-label="Jump to dashboard section">
      ${SECTION_LINKS.map(
        (link, index) => `
        <a
          href="#${escapeHTML(link.id)}"
          class="student-section-nav-chip${index === 0 ? " is-active" : ""}"
          data-section-nav="${escapeHTML(link.id)}"
        >${escapeHTML(link.label)}</a>
      `
      ).join("")}
    </nav>
  `;
}

/**
 * @param {HTMLElement} root
 */
export function bindStudentSectionNav(root = document) {
  const nav = root.querySelector(".student-section-nav");
  if (!nav) {
    return () => {};
  }

  const chips = [...nav.querySelectorAll("[data-section-nav]")];
  const sections = SECTION_LINKS.map((link) => root.getElementById(link.id)).filter(Boolean);

  function setActiveSection(sectionId) {
    chips.forEach((chip) => {
      const active = chip.dataset.sectionNav === sectionId;
      chip.classList.toggle("is-active", active);
    });
  }

  chips.forEach((chip) => {
    chip.addEventListener("click", (event) => {
      event.preventDefault();
      const target = root.getElementById(chip.dataset.sectionNav);
      if (!target) {
        return;
      }

      target.scrollIntoView({ behavior: "smooth", block: "start" });
      history.replaceState(null, "", `#${chip.dataset.sectionNav}`);
      setActiveSection(chip.dataset.sectionNav);
    });
  });

  let observer = null;
  if (sections.length && "IntersectionObserver" in window) {
    const visible = new Map();

    observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          visible.set(entry.target.id, entry.intersectionRatio);
        });

        let bestId = null;
        let bestRatio = 0;

        for (const section of sections) {
          const ratio = visible.get(section.id) ?? 0;
          if (ratio > bestRatio) {
            bestRatio = ratio;
            bestId = section.id;
          }
        }

        if (bestId && bestRatio > 0) {
          setActiveSection(bestId);
        }
      },
      {
        root: null,
        rootMargin: "-20% 0px -55% 0px",
        threshold: [0, 0.15, 0.35, 0.55, 0.75, 1],
      }
    );

    sections.forEach((section) => observer.observe(section));
  }

  const initialHash = window.location.hash.replace("#", "");
  if (initialHash && sections.some((section) => section.id === initialHash)) {
    setActiveSection(initialHash);
  }

  return () => observer?.disconnect();
}

/**
 * @param {string} sectionId
 */
export function scrollToStudentSection(sectionId) {
  const target = document.getElementById(sectionId);
  if (!target) {
    return;
  }

  target.scrollIntoView({ behavior: "smooth", block: "start" });
  history.replaceState(null, "", `#${sectionId}`);
}
