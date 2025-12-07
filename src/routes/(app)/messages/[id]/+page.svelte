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

	function formatTime(date: string | Date) {
		return new Date(date).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
	}

	function formatDate(date: string | Date) {
		return new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
	}

	async function scrollToBottom() {
		await tick();
		if (messagesContainer) {
			messagesContainer.scrollTop = messagesContainer.scrollHeight;
		}
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
				<div class="flex {isOwn ? 'justify-end' : 'justify-start'}">
					<div class="max-w-[75%] {isOwn ? 'bg-primary-600 text-white' : 'bg-white border'} rounded-lg px-4 py-2 shadow-sm">
						{#if !isOwn}
							<div class="text-xs font-medium text-primary-600 mb-1">{message.senderName}</div>
						{/if}
						<p class="text-sm whitespace-pre-wrap break-words">{message.content}</p>
						<div class="text-xs {isOwn ? 'text-primary-200' : 'text-gray-400'} mt-1 text-right">
							{formatTime(message.createdAt)}
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
