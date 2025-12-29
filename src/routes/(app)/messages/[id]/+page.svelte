<script lang="ts">
	import { enhance } from '$app/forms';
	import { tick } from 'svelte';
	import type { PageData, ActionData } from './$types';

	export let data: PageData;
	export let form: ActionData;

	$: messages = data.messages;
	$: currentUserId = data.currentUserId;

	let messageInput = '';
	let messagesContainer: HTMLDivElement;
	let loading = false;

	// Thread state
	let selectedThread: {
		parentMessage: {
			id: string;
			content: string;
			senderName: string;
			createdAt: string | Date;
			threadReplyCount: number;
		};
		replies: Array<{
			id: string;
			content: string;
			senderName: string;
			senderId: string;
			createdAt: string | Date;
		}>;
	} | null = null;
	let threadReplyInput = '';
	let loadingThread = false;
	let sendingThreadReply = false;

	function formatTime(date: string | Date) {
		return new Date(date).toLocaleTimeString('en-US', { timeZone: 'America/Los_Angeles', hour: 'numeric', minute: '2-digit' });
	}

	function formatDate(date: string | Date) {
		return new Date(date).toLocaleDateString('en-US', { timeZone: 'America/Los_Angeles', month: 'short', day: 'numeric' });
	}

	async function scrollToBottom() {
		await tick();
		if (messagesContainer) {
			messagesContainer.scrollTop = messagesContainer.scrollHeight;
		}
	}

	async function openThread(message: typeof messages[0]) {
		loadingThread = true;
		try {
			const response = await fetch(`/api/conversations/${data.conversation.id}/messages/${message.id}/thread`);
			const threadData = await response.json();
			selectedThread = {
				parentMessage: threadData.parentMessage,
				replies: threadData.replies
			};
		} catch (e) {
			console.error('Failed to load thread', e);
		}
		loadingThread = false;
	}

	function closeThread() {
		selectedThread = null;
		threadReplyInput = '';
	}

	async function sendThreadReply() {
		if (!selectedThread || !threadReplyInput.trim()) return;

		sendingThreadReply = true;
		try {
			const response = await fetch(
				`/api/conversations/${data.conversation.id}/messages/${selectedThread.parentMessage.id}/thread`,
				{
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ content: threadReplyInput })
				}
			);

			if (response.ok) {
				// Refresh thread
				await openThread({ id: selectedThread.parentMessage.id } as typeof messages[0]);
				threadReplyInput = '';
			}
		} catch (e) {
			console.error('Failed to send thread reply', e);
		}
		sendingThreadReply = false;
	}

	$: if (messages) {
		scrollToBottom();
	}
</script>

<svelte:head>
	<title>{data.conversation.displayTitle} - TeamTime</title>
</svelte:head>

<div class="flex flex-col h-[calc(100vh-4rem)]">
	<!-- Header -->
	<div class="flex items-center gap-4 p-4 border-b bg-white">
		<a href="/messages" class="btn-ghost p-2 lg:hidden">
			<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
			</svg>
		</a>
		<div class="flex-1">
			<h1 class="font-semibold">{data.conversation.displayTitle}</h1>
			<p class="text-xs text-gray-500">
				{data.participants.length} participant{data.participants.length !== 1 ? 's' : ''}
			</p>
		</div>
	</div>

	<!-- Messages -->
	<div bind:this={messagesContainer} class="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50">
		{#each messages as message, i}
			{@const isOwn = message.senderId === currentUserId}
			{@const showDate = i === 0 || formatDate(messages[i-1].createdAt) !== formatDate(message.createdAt)}

			{#if showDate}
				<div class="text-center text-xs text-gray-500 py-2">
					{formatDate(message.createdAt)}
				</div>
			{/if}

			{#if message.isSystemMessage}
				<div class="text-center text-xs text-gray-500 italic py-2">
					{message.content}
				</div>
			{:else}
				<div class="flex {isOwn ? 'justify-end' : 'justify-start'} group">
					<div class="max-w-[75%]">
						<div class="{isOwn ? 'bg-primary-600 text-white' : 'bg-white border'} rounded-lg px-4 py-2 shadow-sm">
							{#if !isOwn}
								<div class="text-xs font-medium text-primary-600 mb-1">{message.senderName}</div>
							{/if}
							<p class="text-sm whitespace-pre-wrap break-words">{message.content}</p>
							<div class="text-xs {isOwn ? 'text-primary-200' : 'text-gray-400'} mt-1 text-right">
								{formatTime(message.createdAt)}
							</div>
						</div>
						<!-- Thread indicator and reply button -->
						<div class="flex items-center gap-2 mt-1 {isOwn ? 'justify-end' : 'justify-start'}">
							{#if message.threadReplyCount > 0}
								<button
									on:click={() => openThread(message)}
									class="text-xs text-primary-600 hover:text-primary-700 flex items-center gap-1"
								>
									<svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
										<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
									</svg>
									{message.threadReplyCount} {message.threadReplyCount === 1 ? 'reply' : 'replies'}
								</button>
							{:else}
								<button
									on:click={() => openThread(message)}
									class="text-xs text-gray-400 hover:text-gray-600 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1"
								>
									<svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
										<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
									</svg>
									Reply in thread
								</button>
							{/if}
						</div>
					</div>
				</div>
			{/if}
		{:else}
			<div class="text-center text-gray-500 py-8">
				No messages yet. Start the conversation!
			</div>
		{/each}
	</div>

	<!-- Input -->
	<div class="p-4 bg-white border-t">
		<form
			method="POST"
			action="?/send"
			use:enhance={() => {
				loading = true;
				const msg = messageInput;
				messageInput = '';
				return async ({ update }) => {
					loading = false;
					await update();
				};
			}}
			class="flex gap-2"
		>
			<input
				type="text"
				name="content"
				bind:value={messageInput}
				placeholder="Type a message..."
				class="input flex-1"
				autocomplete="off"
			/>
			<button
				type="submit"
				disabled={loading || !messageInput.trim()}
				class="btn-primary px-6"
			>
				<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
				</svg>
			</button>
		</form>
	</div>
</div>

<!-- Thread Panel -->
{#if selectedThread}
	<div class="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-end lg:items-center lg:justify-end">
		<div class="bg-white w-full lg:w-96 h-[80vh] lg:h-full lg:max-h-screen flex flex-col rounded-t-xl lg:rounded-none shadow-xl">
			<!-- Thread Header -->
			<div class="flex items-center justify-between p-4 border-b">
				<h2 class="font-semibold">Thread</h2>
				<button on:click={closeThread} class="text-gray-500 hover:text-gray-700">
					<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
					</svg>
				</button>
			</div>

			<!-- Parent Message -->
			<div class="p-4 border-b bg-gray-50">
				<div class="text-xs font-medium text-primary-600 mb-1">
					{selectedThread.parentMessage.senderName}
				</div>
				<p class="text-sm">{selectedThread.parentMessage.content}</p>
				<div class="text-xs text-gray-400 mt-1">
					{formatTime(selectedThread.parentMessage.createdAt)}
				</div>
			</div>

			<!-- Thread Replies -->
			<div class="flex-1 overflow-y-auto p-4 space-y-3">
				{#if loadingThread}
					<div class="text-center text-gray-500 py-4">Loading thread...</div>
				{:else if selectedThread.replies.length === 0}
					<div class="text-center text-gray-500 py-4 text-sm">
						No replies yet. Start the thread!
					</div>
				{:else}
					{#each selectedThread.replies as reply}
						{@const isOwnReply = reply.senderId === currentUserId}
						<div class="flex {isOwnReply ? 'justify-end' : 'justify-start'}">
							<div class="max-w-[85%] {isOwnReply ? 'bg-primary-600 text-white' : 'bg-gray-100'} rounded-lg px-3 py-2">
								{#if !isOwnReply}
									<div class="text-xs font-medium text-primary-600 mb-1">{reply.senderName}</div>
								{/if}
								<p class="text-sm whitespace-pre-wrap break-words">{reply.content}</p>
								<div class="text-xs {isOwnReply ? 'text-primary-200' : 'text-gray-400'} mt-1 text-right">
									{formatTime(reply.createdAt)}
								</div>
							</div>
						</div>
					{/each}
				{/if}
			</div>

			<!-- Thread Reply Input -->
			<div class="p-4 border-t">
				<div class="flex gap-2">
					<input
						type="text"
						bind:value={threadReplyInput}
						placeholder="Reply to thread..."
						class="input flex-1"
						autocomplete="off"
						on:keydown={(e) => e.key === 'Enter' && !e.shiftKey && sendThreadReply()}
					/>
					<button
						on:click={sendThreadReply}
						disabled={sendingThreadReply || !threadReplyInput.trim()}
						class="btn-primary px-4"
					>
						{#if sendingThreadReply}
							...
						{:else}
							<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
							</svg>
						{/if}
					</button>
				</div>
			</div>
		</div>
	</div>
{/if}
