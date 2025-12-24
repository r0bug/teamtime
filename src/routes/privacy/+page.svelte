<script lang="ts">
	import type { PageData } from './$types';

	export let data: PageData;

	$: siteTitle = data.siteTitle || 'TeamTime';
</script>

<svelte:head>
	<title>Privacy Policy - {siteTitle}</title>
</svelte:head>

<div class="min-h-screen bg-gray-50 py-12 px-4">
	<div class="max-w-3xl mx-auto">
		<div class="bg-white rounded-lg shadow-sm p-8">
			<h1 class="text-3xl font-bold text-gray-900 mb-2">{siteTitle} Privacy Policy</h1>
			<p class="text-sm text-gray-500 mb-8">Last Updated: December 2024</p>

			<div class="prose prose-gray max-w-none space-y-6">
				<section>
					<h2 class="text-xl font-semibold text-gray-900 mb-3">Introduction</h2>
					<p class="text-gray-700">
						This Privacy Policy describes how {siteTitle} ("we," "us," or "our") collects, uses,
						and protects your personal information when you use our workforce management platform
						and related services, including SMS notifications.
					</p>
				</section>

				<section>
					<h2 class="text-xl font-semibold text-gray-900 mb-3">Information We Collect</h2>
					<p class="text-gray-700 mb-3">We collect the following types of information:</p>
					<ul class="list-disc pl-6 text-gray-700 space-y-2">
						<li><strong>Account Information:</strong> Name, email address, phone number, and employment details provided by your employer or administrator.</li>
						<li><strong>Work Data:</strong> Time entries, schedules, task assignments, and location data (when clocking in/out).</li>
						<li><strong>Communication Data:</strong> Messages sent through the platform and notification preferences.</li>
						<li><strong>Device Information:</strong> Browser type, device identifiers, and IP address for security purposes.</li>
					</ul>
				</section>

				<section>
					<h2 class="text-xl font-semibold text-gray-900 mb-3">Mobile Phone Number Collection & SMS Messaging</h2>
					<p class="text-gray-700 mb-3">
						<strong>How We Collect Mobile Numbers:</strong> Your mobile phone number is provided by your employer
						or organization administrator when creating your account, or by you directly when updating your profile settings.
					</p>
					<p class="text-gray-700 mb-3">
						<strong>How We Use Mobile Numbers:</strong> By providing your phone number and opting in to SMS notifications,
						you consent to receive text messages from {siteTitle} related to:
					</p>
					<ul class="list-disc pl-6 text-gray-700 space-y-2">
						<li>Schedule updates and shift reminders</li>
						<li>Task assignments and notifications</li>
						<li>Time-sensitive work communications</li>
						<li>Account security alerts</li>
					</ul>
					<p class="text-gray-700 mt-3">
						<strong>How We Protect Mobile Numbers:</strong> Your mobile phone number is stored securely using
						industry-standard encryption. Access is restricted to authorized personnel only.
					</p>
					<div class="bg-green-50 border border-green-200 rounded-lg p-4 mt-4">
						<p class="text-green-800 text-sm">
							<strong>No Third-Party Marketing:</strong> We will never sell, rent, or share your mobile phone number
							or SMS opt-in consent data with third parties or affiliates for marketing or promotional purposes.
						</p>
					</div>
					<div class="bg-blue-50 border border-blue-200 rounded-lg p-4 mt-3">
						<p class="text-blue-800 text-sm">
							<strong>Message Frequency:</strong> Message frequency varies based on your work schedule and settings.
							You may receive approximately 2-10 messages per week depending on your schedule activity.
							<strong>Message and data rates may apply.</strong> Carriers are not liable for delayed or undelivered messages.
						</p>
					</div>
				</section>

				<section>
					<h2 class="text-xl font-semibold text-gray-900 mb-3">Opting Out of SMS</h2>
					<p class="text-gray-700">
						You can opt out of SMS notifications at any time by:
					</p>
					<ul class="list-disc pl-6 text-gray-700 space-y-2 mt-3">
						<li>Replying <strong>STOP</strong> to any message you receive from us</li>
						<li>Updating your notification preferences in your account settings</li>
						<li>Contacting your administrator to update your preferences</li>
					</ul>
					<p class="text-gray-700 mt-3">
						After opting out, you will receive a confirmation message. You can opt back in at any time
						by replying <strong>START</strong> or updating your settings.
					</p>
				</section>

				<section>
					<h2 class="text-xl font-semibold text-gray-900 mb-3">How We Use Your Information</h2>
					<p class="text-gray-700 mb-3">We use collected information to:</p>
					<ul class="list-disc pl-6 text-gray-700 space-y-2">
						<li>Provide workforce management services to you and your employer</li>
						<li>Send notifications about schedules, tasks, and work-related updates</li>
						<li>Process time tracking and attendance records</li>
						<li>Improve our services and user experience</li>
						<li>Ensure platform security and prevent fraud</li>
						<li>Comply with legal obligations</li>
					</ul>
				</section>

				<section>
					<h2 class="text-xl font-semibold text-gray-900 mb-3">Data Sharing</h2>
					<p class="text-gray-700">
						We do not sell, rent, or trade your personal information. We may share your information only in the following limited circumstances:
					</p>
					<ul class="list-disc pl-6 text-gray-700 space-y-2 mt-3">
						<li><strong>Your Employer:</strong> Work-related data is shared with your organization's administrators.</li>
						<li><strong>Service Providers:</strong> Third-party services that help us operate the platform (e.g., SMS delivery via Twilio, hosting). These providers are contractually bound to use your data only to provide services to us.</li>
						<li><strong>Legal Requirements:</strong> When required by law or to protect our rights.</li>
					</ul>
					<div class="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mt-4">
						<p class="text-yellow-800 text-sm">
							<strong>Important:</strong> Your mobile phone number and SMS opt-in/opt-out status will never be
							shared with third parties or affiliates for their own marketing or promotional purposes.
						</p>
					</div>
				</section>

				<section>
					<h2 class="text-xl font-semibold text-gray-900 mb-3">Data Security</h2>
					<p class="text-gray-700">
						We implement industry-standard security measures to protect your information, including
						encryption in transit and at rest, secure authentication, and regular security audits.
					</p>
				</section>

				<section>
					<h2 class="text-xl font-semibold text-gray-900 mb-3">Data Retention</h2>
					<p class="text-gray-700">
						We retain your information for as long as your account is active or as needed to provide
						services. Work records may be retained longer as required by law or your employer's policies.
					</p>
				</section>

				<section>
					<h2 class="text-xl font-semibold text-gray-900 mb-3">Your Rights</h2>
					<p class="text-gray-700 mb-3">Depending on your location, you may have the right to:</p>
					<ul class="list-disc pl-6 text-gray-700 space-y-2">
						<li>Access and receive a copy of your personal information</li>
						<li>Request correction of inaccurate information</li>
						<li>Request deletion of your information (subject to legal requirements)</li>
						<li>Opt out of certain communications</li>
					</ul>
				</section>

				<section>
					<h2 class="text-xl font-semibold text-gray-900 mb-3">Contact Us</h2>
					<p class="text-gray-700">
						For questions about this Privacy Policy, to exercise your rights, or for SMS support,
						please contact your organization's administrator or reach out to us at:
					</p>
					<div class="bg-gray-50 rounded-lg p-4 mt-3">
						<p class="text-gray-700">
							<strong>Email:</strong> privacy@yakimafinds.com<br>
							<strong>For SMS Help:</strong> Reply HELP to any message
						</p>
					</div>
				</section>

				<section>
					<h2 class="text-xl font-semibold text-gray-900 mb-3">Changes to This Policy</h2>
					<p class="text-gray-700">
						We may update this Privacy Policy periodically. We will notify users of significant
						changes through the platform or via email.
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
