import React from 'react';
import {
  STANDALONE_ABOUT_PRIVACY_ROUTE,
  type StandaloneRoute,
} from '../../app/standalone';

export type PolicySection = {
  heading: string;
  blocks: string[];
};

export type PolicyDocument = {
  title: string;
  preface: string[];
  sections: PolicySection[];
};

export function parsePolicyDocument(rawText: string): PolicyDocument {
  const lines = rawText.replace(/\r/g, '').split('\n');
  const titleIndex = lines.findIndex((line) => line.trim().length > 0);

  if (titleIndex === -1) {
    return {
      title: '',
      preface: [],
      sections: [],
    };
  }

  const title = lines[titleIndex].trim();
  const preface: string[] = [];
  const sections: PolicySection[] = [];
  let currentHeading: string | null = null;
  let currentBlocks: string[] = [];
  let currentParagraph: string[] = [];

  const pushParagraph = () => {
    const paragraph = currentParagraph.join(' ').replace(/\s+/gu, ' ').trim();
    if (!paragraph) {
      currentParagraph = [];
      return;
    }

    if (currentHeading) {
      currentBlocks.push(paragraph);
    } else {
      preface.push(paragraph);
    }

    currentParagraph = [];
  };

  const pushSection = () => {
    pushParagraph();

    if (!currentHeading) {
      return;
    }

    sections.push({
      heading: currentHeading,
      blocks: currentBlocks,
    });

    currentHeading = null;
    currentBlocks = [];
  };

  for (const rawLine of lines.slice(titleIndex + 1)) {
    const line = rawLine.trim();

    if (!line) {
      pushParagraph();
      continue;
    }

    const headingMatch = line.match(/^\d+\.\s+(.+)$/u);
    if (headingMatch) {
      pushSection();
      currentHeading = headingMatch[1].trim();
      continue;
    }

    currentParagraph.push(line);
  }

  pushSection();

  return {
    title,
    preface,
    sections,
  };
}

function renderPolicyInlineText(
  text: string,
  onNavigate: (route: StandaloneRoute) => void,
  privacyLabel: string,
) {
  const privacyLinkPlaceholder = '[Link to Privacy Policy]';

  if (!text.includes(privacyLinkPlaceholder)) {
    return text;
  }

  const parts = text.split(privacyLinkPlaceholder);

  return parts.map((part, index) => (
    <React.Fragment key={`${part}-${index}`}>
      {part}
      {index < parts.length - 1 && (
        <button
          type="button"
          className="inline font-semibold text-[color:var(--color-text-info)] underline decoration-2 underline-offset-4 transition-opacity hover:opacity-80"
          onClick={() => onNavigate(STANDALONE_ABOUT_PRIVACY_ROUTE)}
        >
          {privacyLabel}
        </button>
      )}
    </React.Fragment>
  ));
}

export function PolicyDocumentView({
  document,
  kicker,
  title,
  onNavigate,
  privacyLabel,
}: {
  document: PolicyDocument;
  kicker: string;
  title: string;
  onNavigate: (route: StandaloneRoute) => void;
  privacyLabel: string;
}) {
  return (
    <article className="standalone-panel standalone-document-panel mx-auto max-w-5xl p-6 sm:p-8 lg:p-10">
      <div className="mx-auto max-w-[72ch] space-y-8">
        <header className="space-y-3">
          <p className="standalone-kicker">{kicker}</p>
          <h2 className="standalone-document-title text-3xl font-semibold tracking-tight sm:text-4xl">
            {title}
          </h2>
          {document.preface.map((paragraph) => (
            <p key={paragraph} className="text-sm leading-7 text-secondary sm:text-base">
              {renderPolicyInlineText(paragraph, onNavigate, privacyLabel)}
            </p>
          ))}
        </header>

        <div className="space-y-5">
          {document.sections.map((section) => {
            const listLeadIndex = section.blocks.findIndex(
              (block, index) => block.endsWith(':') && index < section.blocks.length - 1,
            );
            const paragraphs = listLeadIndex >= 0
              ? section.blocks.slice(0, listLeadIndex + 1)
              : section.blocks;
            const listItems = listLeadIndex >= 0
              ? section.blocks.slice(listLeadIndex + 1)
              : [];

            return (
              <section
                key={section.heading}
                className="standalone-document-section space-y-4 rounded-[1.5rem] p-5 sm:p-6"
              >
                <h3 className="text-xl font-semibold tracking-tight text-default sm:text-2xl">
                  {section.heading}
                </h3>
                <div className="space-y-3 text-sm leading-7 text-secondary sm:text-base">
                  {paragraphs.map((paragraph) => (
                    <p key={paragraph}>
                      {renderPolicyInlineText(paragraph, onNavigate, privacyLabel)}
                    </p>
                  ))}
                  {listItems.length > 0 && (
                    <ul className="space-y-3 pl-5 text-secondary">
                      {listItems.map((item) => (
                        <li key={item} className="list-disc">
                          {renderPolicyInlineText(item, onNavigate, privacyLabel)}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </section>
            );
          })}
        </div>
      </div>
    </article>
  );
}
