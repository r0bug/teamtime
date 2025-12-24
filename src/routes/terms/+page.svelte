<script lang="ts">
	import type { PageData } from './$types';

	export let data: PageData;

	$: siteTitle = data.siteTitle || 'TeamTime';
</script>

<svelte:head>
	<title>Terms of Service - {siteTitle}</title>
</svelte:head>

<div class="min-h-screen bg-gray-50 py-12 px-4">
	<div class="max-w-3xl mx-auto">
		<div class="bg-white rounded-lg shadow-sm p-8">
			<h1 class="text-3xl font-bold text-gray-900 mb-2">{siteTitle} Terms of Service</h1>
			<p class="text-sm text-gray-500 mb-8">Last Updated: December 2024</p>

			<div class="prose prose-gray max-w-none space-y-6">
				<section>
					<h2 class="text-xl font-semibold text-gray-900 mb-3">Acceptance of Terms</h2>
					<p class="text-gray-700">
						By accessing or using {siteTitle} ("the Service"), you agree to be bound by these Terms
						of Service. If you do not agree to these terms, please do not use the Service.
					</p>
				</section>

				<section>
					<h2 class="text-xl font-semibold text-gray-900 mb-3">Description of Service</h2>
					<p class="text-gray-700">
						{siteTitle} is a workforce management platform that provides time tracking, scheduling,
						task management, and communication tools for organizations and their employees.
					</p>
				</section>

				<section>
					<h2 class="text-xl font-semibold text-gray-900 mb-3">User Accounts</h2>
					<ul class="list-disc pl-6 text-gray-700 space-y-2">
						<li>You are responsible for maintaining the confidentiality of your account credentials.</li>
						<li>You agree to provide accurate and complete information when using the Service.</li>
						<li>You must notify your administrator immediately of any unauthorized use of your account.</li>
						<li>Account access is provided by your employer or organization administrator.</li>
					</ul>
				</section>

				<section>
					<h2 class="text-xl font-semibold text-gray-900 mb-3">SMS Terms</h2>
					<p class="text-gray-700 mb-3">
						By opting in to receive SMS messages from {siteTitle}, you agree to the following:
					</p>
					<ul class="list-disc pl-6 text-gray-700 space-y-2">
						<li>You consent to receive automated text messages related to your work schedule, tasks, and notifications.</li>
						<li>Message frequency varies based on your work activity and settings.</li>
						<li>Message and data rates may apply depending on your mobile carrier plan.</li>
						<li>You can opt out at any time by replying STOP to any message.</li>
						<li>For help, reply HELP to any message or contact your administrator.</li>
						<li>Carriers are not liable for delayed or undelivered messages.</li>
					</ul>
					<div class="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mt-4">
						<p class="text-yellow-800 text-sm">
							<strong>Important:</strong> SMS messaging is a convenience feature. Critical work information
							should always be verified through the {siteTitle} platform or your supervisor.
						</p>
					</div>
				</section>

				<section>
					<h2 class="text-xl font-semibold text-gray-900 mb-3">Acceptable Use</h2>
					<p class="text-gray-700 mb-3">You agree not to:</p>
					<ul class="list-disc pl-6 text-gray-700 space-y-2">
						<li>Use the Service for any unlawful purpose</li>
						<li>Share your account credentials with others</li>
						<li>Attempt to gain unauthorized access to the Service or its systems</li>
						<li>Submit false or misleading information (including time entries)</li>
						<li>Interfere with or disrupt the Service</li>
						<li>Use automated systems to access the Service without permission</li>
					</ul>
				</section>

				<section>
					<h2 class="text-xl font-semibold text-gray-900 mb-3">Data and Privacy</h2>
					<p class="text-gray-700">
						Your use of the Service is also governed by our <a href="/privacy" class="text-primary-600 hover:text-primary-700">Privacy Policy</a>,
						which describes how we collect, use, and protect your information.
					</p>
				</section>

				<section>
					<h2 class="text-xl font-semibold text-gray-900 mb-3">Intellectual Property</h2>
					<p class="text-gray-700">
						The Service and its original content, features, and functionality are owned by
						{siteTitle} and are protected by applicable intellectual property laws.
					</p>
				</section>

				<section>
					<h2 class="text-xl font-semibold text-gray-900 mb-3">Disclaimer of Warranties</h2>
					<p class="text-gray-700">
						The Service is provided "as is" and "as available" without warranties of any kind,
						either express or implied. We do not guarantee that the Service will be uninterrupted,
						secure, or error-free.
					</p>
				</section>

				<section>
					<h2 class="text-xl font-semibold text-gray-900 mb-3">Limitation of Liability</h2>
					<p class="text-gray-700">
						To the fullest extent permitted by law, {siteTitle} shall not be liable for any
						indirect, incidental, special, consequential, or punitive damages arising from your
						use of the Service.
					</p>
				</section>

				<section>
					<h2 class="text-xl font-semibold text-gray-900 mb-3">Termination</h2>
					<p class="text-gray-700">
						Your access to the Service may be terminated by your employer or organization at any
						time. We may also suspend or terminate access for violations of these Terms.
					</p>
				</section>

				<section>
					<h2 class="text-xl font-semibold text-gray-900 mb-3">Changes to Terms</h2>
					<p class="text-gray-700">
						We reserve the right to modify these Terms at any time. Continued use of the Service
						after changes constitutes acceptance of the modified Terms.
					</p>
				</section>

				<section>
					<h2 class="text-xl font-semibold text-gray-900 mb-3">Contact</h2>
					<p class="text-gray-700">
						For questions about these Terms of Service, please contact your organization
						administrator or email us at: <strong>support@yakimafinds.com</strong>
					</p>
				</section>
			</div>

			<div class="mt-8 pt-6 border-t border-gray-200">
				<a href="/login" class="text-primary-600 hover:text-primary-700 font-medium">
					&larr; Back to Login
				</a>
			</div>
		</div>
	</div>
</div>
