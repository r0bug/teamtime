<script lang="ts">
	import { Marked } from 'marked';
	import { markedHighlight } from 'marked-highlight';
	import hljs from 'highlight.js';

	export let content: string;
	export let class_name: string = '';

	let renderedHtml = '';

	// Create marked instance with highlight extension
	const marked = new Marked(
		markedHighlight({
			langPrefix: 'hljs language-',
			highlight(code, lang) {
				const language = hljs.getLanguage(lang) ? lang : 'plaintext';
				return hljs.highlight(code, { language }).value;
			}
		})
	);

	// Configure marked options
	marked.setOptions({
		breaks: true,
		gfm: true
	});

	// Render markdown when content changes
	$: {
		try {
			const result = marked.parse(content || '');
			// Handle both sync and async (marked v17 returns string sync with our config)
			if (typeof result === 'string') {
				renderedHtml = result;
			} else {
				result.then((html: string) => {
					renderedHtml = html;
				});
			}
		} catch (err) {
			console.error('Markdown parse error:', err);
			renderedHtml = content || '';
		}
	}
</script>

<div class="markdown-content {class_name}">
	{@html renderedHtml}
</div>

<style>
	/* Markdown content styling */
	.markdown-content {
		line-height: 1.6;
	}

	.markdown-content :global(h1) {
		font-size: 1.5rem;
		font-weight: 700;
		margin-top: 1.5rem;
		margin-bottom: 0.75rem;
		border-bottom: 1px solid #e5e7eb;
		padding-bottom: 0.5rem;
	}

	.markdown-content :global(h2) {
		font-size: 1.25rem;
		font-weight: 600;
		margin-top: 1.25rem;
		margin-bottom: 0.5rem;
	}

	.markdown-content :global(h3) {
		font-size: 1.1rem;
		font-weight: 600;
		margin-top: 1rem;
		margin-bottom: 0.5rem;
	}

	.markdown-content :global(p) {
		margin-bottom: 0.75rem;
	}

	.markdown-content :global(p:last-child) {
		margin-bottom: 0;
	}

	.markdown-content :global(ul),
	.markdown-content :global(ol) {
		margin-bottom: 0.75rem;
		padding-left: 1.5rem;
	}

	.markdown-content :global(ul) {
		list-style-type: disc;
	}

	.markdown-content :global(ol) {
		list-style-type: decimal;
	}

	.markdown-content :global(li) {
		margin-bottom: 0.25rem;
	}

	.markdown-content :global(code) {
		font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
		font-size: 0.875em;
		background-color: rgba(0, 0, 0, 0.06);
		padding: 0.125rem 0.375rem;
		border-radius: 0.25rem;
	}

	.markdown-content :global(pre) {
		background-color: #1e1e1e;
		color: #d4d4d4;
		padding: 1rem;
		border-radius: 0.5rem;
		overflow-x: auto;
		margin-bottom: 0.75rem;
	}

	.markdown-content :global(pre code) {
		background-color: transparent;
		padding: 0;
		color: inherit;
		font-size: 0.85rem;
		line-height: 1.5;
	}

	.markdown-content :global(blockquote) {
		border-left: 4px solid #3b82f6;
		padding-left: 1rem;
		margin-left: 0;
		margin-bottom: 0.75rem;
		color: #4b5563;
		font-style: italic;
	}

	.markdown-content :global(a) {
		color: #2563eb;
		text-decoration: underline;
	}

	.markdown-content :global(a:hover) {
		color: #1d4ed8;
	}

	.markdown-content :global(table) {
		width: 100%;
		border-collapse: collapse;
		margin-bottom: 0.75rem;
	}

	.markdown-content :global(th),
	.markdown-content :global(td) {
		border: 1px solid #e5e7eb;
		padding: 0.5rem;
		text-align: left;
	}

	.markdown-content :global(th) {
		background-color: #f9fafb;
		font-weight: 600;
	}

	.markdown-content :global(hr) {
		border: none;
		border-top: 1px solid #e5e7eb;
		margin: 1rem 0;
	}

	.markdown-content :global(strong) {
		font-weight: 600;
	}

	.markdown-content :global(em) {
		font-style: italic;
	}

	/* Syntax highlighting (VS Code Dark+ theme) */
	.markdown-content :global(.hljs-keyword) {
		color: #569cd6;
	}

	.markdown-content :global(.hljs-string) {
		color: #ce9178;
	}

	.markdown-content :global(.hljs-number) {
		color: #b5cea8;
	}

	.markdown-content :global(.hljs-comment) {
		color: #6a9955;
	}

	.markdown-content :global(.hljs-function) {
		color: #dcdcaa;
	}

	.markdown-content :global(.hljs-class) {
		color: #4ec9b0;
	}

	.markdown-content :global(.hljs-variable) {
		color: #9cdcfe;
	}

	.markdown-content :global(.hljs-type) {
		color: #4ec9b0;
	}

	.markdown-content :global(.hljs-attr) {
		color: #9cdcfe;
	}

	.markdown-content :global(.hljs-property) {
		color: #9cdcfe;
	}

	.markdown-content :global(.hljs-tag) {
		color: #569cd6;
	}

	.markdown-content :global(.hljs-name) {
		color: #569cd6;
	}

	.markdown-content :global(.hljs-attribute) {
		color: #9cdcfe;
	}

	.markdown-content :global(.hljs-built_in) {
		color: #4ec9b0;
	}

	.markdown-content :global(.hljs-literal) {
		color: #569cd6;
	}

	.markdown-content :global(.hljs-params) {
		color: #9cdcfe;
	}

	.markdown-content :global(.hljs-title) {
		color: #dcdcaa;
	}

	.markdown-content :global(.hljs-meta) {
		color: #569cd6;
	}

	.markdown-content :global(.hljs-title.function_) {
		color: #dcdcaa;
	}

	.markdown-content :global(.hljs-title.class_) {
		color: #4ec9b0;
	}
</style>
