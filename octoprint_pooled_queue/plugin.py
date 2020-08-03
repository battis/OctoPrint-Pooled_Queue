# coding=utf-8
from __future__ import absolute_import

from octoprint.plugin import SettingsPlugin, TemplatePlugin, AssetPlugin, ReloadNeedingPlugin


class PooledQueuePlugin(SettingsPlugin,
						TemplatePlugin,
						AssetPlugin,
						ReloadNeedingPlugin):

	# ~~ SettingsPlugin mixin

	def get_settings_defaults(self):
		return dict(
			upload_path="local",
			button_text="Pooled Queue",
			instructions="Select a file from the pooled queue to upload to this printer&hellip;",
			queue_url=None,
			queue_token=None,
			queue_id_field="id",
			queue_filename_field="filename",
			queue_owner_field="owner",
			queue_date_field="date",
			queue_comment_field="comment",
			include_comment=True,
			print=False,
			select=True
		)

	# ~~ TemplatePlugin

	def get_template_configs(self):
		return dict(
			type="generic",
			template="pooled_queue.jinja2"
		)

	# ~~ AssetPlugin mixin

	def get_assets(self):
		# Define your plugin's asset files to automatically include in the
		# core UI here.
		return dict(
			js=["js/pooled_queue.js"],
			css=["css/pooled_queue.css"]
		)

	# ~~ Softwareupdate hook

	def get_update_information(self):
		# Define the configuration for your plugin to use with the Software Update
		# Plugin here. See https://docs.octoprint.org/en/master/bundledplugins/softwareupdate.html
		# for details.
		return dict(
			pooled_queue=dict(
				displayName="Pooled-queue Plugin",
				displayVersion=self._plugin_version,

				# version check: github repository
				type="github_release",
				user="battis",
				repo="OctoPrint-PooledQueue",
				current=self._plugin_version,

				# update method: pip
				pip="https://github.com/battis/OctoPrint-PooledQueue/archive/{target_version}.zip"
			)
		)
