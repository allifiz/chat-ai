"use client";

import {
  Children,
  isValidElement,
  type ReactNode,
  type ReactElement,
} from "react";
import ReactMarkdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import remarkGfm from "remark-gfm";
import { CodeBlock } from "@/components/CodeBlock";

function getNodeText(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") {
    return String(node);
  }

  if (Array.isArray(node)) {
    return node.map(getNodeText).join("");
  }

  if (isValidElement(node)) {
    const props = node.props as { children?: ReactNode };
    return getNodeText(props.children);
  }

  return "";
}

export function MarkdownMessage({ content }: { content: string }) {
  return (
    <div className="markdown-body">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight]}
        components={{
          pre({ children }) {
            const child = Children.only(children) as ReactElement<{
              className?: string;
              children?: ReactNode;
            }>;

            const className = child.props.className ?? "";
            const language =
              /language-([^\s]+)/.exec(className)?.[1] ?? "code";
            const code = getNodeText(child.props.children).replace(/\n$/, "");

            return (
              <CodeBlock code={code} language={language}>
                {children}
              </CodeBlock>
            );
          },
          code({ className, children, ...props }) {
            const isBlock = Boolean(className?.includes("language-"));

            return (
              <code
                className={isBlock ? className : "inline-code"}
                {...props}
              >
                {children}
              </code>
            );
          },
          a({ children, ...props }) {
            return (
              <a {...props} target="_blank" rel="noreferrer noopener">
                {children}
              </a>
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
