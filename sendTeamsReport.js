import fs from 'fs';
import https from 'https';

const TEST_RESULT_PATHS = [
	'test-results/test-results.json',
	'e2e-playwright/test-results/test-results.json',
	'e2e-playwright/playwright-report/results.json',
	'e2e-playwright/reports/test-results.json',
];

const AAD_GUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ORG_ID_PREFIX = '8:orgid:';
const MAX_FAILED_TESTS_TO_DISPLAY = 5;
const REQUEST_TIMEOUT_MS = 15000;
const LOCALE = 'pl-PL';
const TIME_ZONE = 'Europe/Warsaw';

const DEFAULT_QA_CONTACTS = {
	qa1: {
		name: 'First tester name',
	},
	qa2: {
		name: 'Second tester name',
	},
};

const FALLBACK_RESULTS = {
	stats: { expected: 0, unexpected: 1, skipped: 0, duration: 0 },
	suites: [
		{
			title: 'Test Execution',
			specs: [
				{
					title: 'E2E Tests - No Results Found',
					ok: false,
					tests: [
						{
							results: [
								{
									error: { message: 'Test results file not found - check test execution' },
								},
							],
						},
					],
				},
			],
		},
	],
};

function createConfigFromEnv() {
	return {
		webhookUrl: process.env.TEAMS_WEBHOOK_URL,
		environment: process.env.ENVIRONMENT || 'unknown',
		buildNumber: process.env.BUILD_NUMBER || 'local',
		buildUrl: process.env.BUILD_URL || '#',
		qa1: {
			name: process.env.QA1_NAME || DEFAULT_QA_CONTACTS.qa1.name,
			mentionId: process.env.QA1_TEAMS_MENTION_ID || '',
		},
		qa2: {
			name: process.env.QA2_NAME || DEFAULT_QA_CONTACTS.qa2.name,
			mentionId: process.env.QA2_TEAMS_MENTION_ID || '',
		},
	};
}

class TeamsNotificationSender {
	constructor({ config = createConfigFromEnv(), fsModule = fs, httpsModule = https } = {}) {
		this.config = config;
		this.fs = fsModule;
		this.https = httpsModule;
	}

	validateConfig() {
		if (!this.config.webhookUrl) {
			console.log('⚠️ TEAMS_WEBHOOK_URL not configured. Skipping notification.');
			process.exit(0);
		}
	}

	findTestResults() {
		for (const filePath of TEST_RESULT_PATHS) {
			if (!this.fs.existsSync(filePath)) {
				continue;
			}

			console.log(`📁 Found test results at: ${filePath}`);
			const parsedResults = this.readJsonFile(filePath);
			if (parsedResults) {
				return parsedResults;
			}
		}

		console.log('❌ Test results file not found. Creating fallback notification...');
		return this.createFallbackResults();
	}

	readJsonFile(filePath) {
		try {
			const content = this.fs.readFileSync(filePath, 'utf8');
			return JSON.parse(content);
		} catch (error) {
			console.error(`⚠️ Failed to parse JSON file at ${filePath}: ${error.message}`);
			return null;
		}
	}

	createFallbackResults() {
		return FALLBACK_RESULTS;
	}

	getExecutionStatus(failed) {
		const isSuccess = failed === 0;

		return {
			isSuccess,
			statusEmoji: isSuccess ? '✅' : '❌',
			statusText: isSuccess ? 'PASSED' : 'FAILED',
		};
	}

	calculateTestStatistics(results) {
		const passed = this.normalizeStat(results?.stats?.expected);
		const failed = this.normalizeStat(results?.stats?.unexpected);
		const skipped = this.normalizeStat(results?.stats?.skipped);
		const totalTests = passed + failed + skipped;
		const successRate = totalTests > 0 ? ((passed / totalTests) * 100).toFixed(1) : '0';
		const duration = this.formatDuration(results?.stats?.duration);

		return {
			passed,
			failed,
			skipped,
			totalTests,
			successRate,
			duration,
			...this.getExecutionStatus(failed),
		};
	}

	normalizeStat(value) {
		const numericValue = Number(value);
		if (!Number.isFinite(numericValue) || numericValue < 0) {
			return 0;
		}

		return Math.floor(numericValue);
	}

	formatDuration(milliseconds) {
		if (!milliseconds) return '0s';

		const totalSeconds = Math.floor(milliseconds / 1000);
		const minutes = Math.floor(totalSeconds / 60);
		const seconds = totalSeconds % 60;

		return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
	}

	extractFailedTestsDetails(results) {
		const suites = Array.isArray(results?.suites) ? results.suites : [];

		return suites
			.flatMap(suite => (Array.isArray(suite?.specs) ? suite.specs : []))
			.filter(spec => spec?.ok === false)
			.map(spec => {
				const error = spec.tests?.[0]?.results?.[0]?.error?.message?.split('\n')[0] || 'No details';
				return `• **${spec.title}**${error !== 'No details' ? `\n  ❌ ${error}` : ''}`;
			})
			.slice(0, MAX_FAILED_TESTS_TO_DISPLAY)
			.join('\n\n');
	}

	createMentions(hasFailed) {
		if (!hasFailed) return { mentions: [], mentionText: '' };

		const qa1MentionId = this.resolveMentionId(this.config.qa1.mentionId);
		const qa2MentionId = this.resolveMentionId(this.config.qa2.mentionId);

		const allMentions = [
			this.createMentionEntity(this.config.qa1.name, qa1MentionId),
			this.createMentionEntity(this.config.qa2.name, qa2MentionId),
		];
		const mentions = allMentions.filter(mention => mention.mentioned.id);
		const mentionText = this.createMentionText(mentions.map(mention => mention.mentioned.name));

		console.log(`🔔 Tests failed - will mention: ${this.config.qa1.name} and ${this.config.qa2.name}`);
		console.log(
			`🧪 Mention ID type: QA1=${this.getMentionIdKind(qa1MentionId)}, QA2=${this.getMentionIdKind(qa2MentionId)}`
		);
		if (!qa1MentionId || !qa2MentionId) {
			const missingMentions = [];
			if (!qa1MentionId) missingMentions.push(this.config.qa1.name);
			if (!qa2MentionId) missingMentions.push(this.config.qa2.name);
			console.log(`⚠️ Missing QA*_TEAMS_MENTION_ID for: ${missingMentions.join(', ')}.`);
		}

		if (mentions.length === 0) {
			console.log('⚠️ No valid mention IDs found. Notification will be sent without explicit mentions.');
		}

		return { mentions, mentionText };
	}

	createMentionEntity(name, mentionId) {
		return {
			type: 'mention',
			text: `<at>${name}</at>`,
			mentioned: { id: mentionId, name },
		};
	}

	createMentionText(names) {
		return names.map(name => `<at>${name}</at>`).join(' ');
	}

	resolveMentionId(rawMentionId) {
		const value = String(rawMentionId || '').trim();

		if (value) {
			return this.normalizeMentionId(value);
		}

		return '';
	}

	normalizeMentionId(rawMentionId) {
		const value = String(rawMentionId || '').trim();
		if (!value) return '';

		if (value.toLowerCase().startsWith(ORG_ID_PREFIX)) {
			const guidPart = value.slice(ORG_ID_PREFIX.length).trim();
			if (this.isAadGuid(guidPart)) {
				return guidPart;
			}

			return value;
		}

		if (this.isAadGuid(value)) {
			return value;
		}

		return value;
	}

	isAadGuid(value) {
		return AAD_GUID_PATTERN.test(value);
	}

	getMentionIdKind(mentionId) {
		if (!mentionId) return 'missing';
		if (mentionId.startsWith(ORG_ID_PREFIX)) return 'aad-orgid-prefixed';
		if (this.isAadGuid(mentionId)) return 'aad-guid';
		if (mentionId.includes('@')) return 'email';
		return 'custom';
	}

	createAdaptiveCard(stats, failedTests, mentions, mentionText) {
		const body = [
			this.createHeaderBlock(),
			...this.createMentionBlock(mentionText),
			this.createFactsBlock(stats),
			...this.createFailedTestsBlock(failedTests),
			...this.createSuccessBlock(stats.isSuccess),
		];

		return {
			type: 'message',
			attachments: [
				{
					contentType: 'application/vnd.microsoft.card.adaptive',
					content: {
						type: 'AdaptiveCard',
						version: '1.4',
						body,
						actions: this.createActionButtons(stats.failed > 0),
						...this.createMsteamsEntities(mentions),
					},
				},
			],
		};
	}

	createHeaderBlock() {
		return {
			type: 'TextBlock',
			text: '🎭 "Project name" E2E Tests',
			weight: 'bolder',
			size: 'large',
		};
	}

	createMentionBlock(mentionText) {
		return mentionText
			? [
					{
						type: 'TextBlock',
						text: mentionText,
						wrap: true,
						spacing: 'medium',
					},
					{
						type: 'TextBlock',
						text: '🔔 Hello team! Please check the failed tests.',
						wrap: true,
						spacing: 'medium',
					},
				]
			: [];
	}

	createFactsBlock(stats) {
		return {
			type: 'FactSet',
			facts: [
				{ title: '🎯 Status', value: `${stats.statusEmoji} ${stats.statusText}` },
				{ title: '🌍 Environment', value: this.config.environment },
				{ title: '📊 Total Tests', value: String(stats.totalTests) },
				{ title: '✅ Passed', value: String(stats.passed) },
				{ title: '❌ Failed', value: String(stats.failed) },
				{ title: '⏭️ Skipped', value: String(stats.skipped) },
				{ title: '📈 Success Rate', value: `${stats.successRate}%` },
				{ title: '⏱️ Duration', value: stats.duration },
				{ title: '🏗️ Build', value: this.config.buildNumber },
				{ title: '🕐 Time', value: this.getCurrentTime() },
			],
		};
	}

	getCurrentTime() {
		return new Date().toLocaleString(LOCALE, { timeZone: TIME_ZONE });
	}

	createFailedTestsBlock(failedTests) {
		return failedTests
			? [
					{
						type: 'TextBlock',
						text: `## ❌ Failed Tests:\n\n${failedTests}`,
						wrap: true,
						spacing: 'medium',
					},
				]
			: [];
	}

	createSuccessBlock(isSuccess) {
		return isSuccess
			? [
					{
						type: 'TextBlock',
						text: '🎉 All tests passed successfully!',
						weight: 'bolder',
						spacing: 'medium',
					},
				]
			: [];
	}

	createActionButtons(hasFailed) {
		const buttons = [
			{
				type: 'Action.OpenUrl',
				title: '📋 View Build Details',
				url: this.config.buildUrl,
			},
		];

		if (hasFailed) {
			buttons.push({
				type: 'Action.OpenUrl',
				title: '🔍 Investigate Failures',
				url: `${this.config.buildUrl}&view=artifacts`,
			});
		}

		return buttons;
	}

	createMsteamsEntities(mentions) {
		return mentions.length > 0
			? {
					msteams: { entities: mentions },
				}
			: {};
	}

	async sendNotification(card) {
		return new Promise((resolve, reject) => {
			const data = JSON.stringify(card);
			const options = {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'User-Agent': 'Playwright-E2E-Reporter/1.0',
				},
			};

			const req = this.https.request(this.config.webhookUrl, options, res => {
				console.log(`✅ Teams notification sent! Status: ${res.statusCode}`);

				let responseBody = '';
				res.on('data', chunk => {
					responseBody += chunk.toString();
				});

				res.on('end', () => {
					if (res.statusCode >= 200 && res.statusCode < 300) {
						console.log('🎉 Teams notification completed successfully!');
						if (responseBody && responseBody !== '1') {
							console.log('📨 Teams response:', responseBody);
						}
						resolve();
					} else {
						reject(new Error(`Teams returned status ${res.statusCode}: ${responseBody}`));
					}
				});
			});

			req.on('error', error => {
				reject(new Error(`Failed to send Teams notification: ${error.message}`));
			});

			req.on('timeout', () => {
				req.destroy();
				reject(new Error('Teams notification request timeout'));
			});

			req.setTimeout(REQUEST_TIMEOUT_MS);
			req.write(data);
			req.end();
		});
	}

	logStatistics(stats) {
		console.log('📤 Sending Teams notification...');
		console.log(`📊 Results: ${stats.passed} passed, ${stats.failed} failed, ${stats.skipped} skipped`);
		console.log(`📈 Success Rate: ${stats.successRate}%, Duration: ${stats.duration}`);
	}

	async execute() {
		try {
			this.validateConfig();

			const testResults = this.findTestResults();
			const stats = this.calculateTestStatistics(testResults);
			const failedTests = this.extractFailedTestsDetails(testResults);
			const { mentions, mentionText } = this.createMentions(stats.failed > 0);

			const card = this.createAdaptiveCard(stats, failedTests, mentions, mentionText);

			this.logStatistics(stats);
			await this.sendNotification(card);
		} catch (error) {
			console.error('❌ Error processing test results:', error.message);
			console.error('Stack:', error.stack);
			process.exit(1);
		}
	}
}

const sender = new TeamsNotificationSender();
await sender.execute();
