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
			oauth2_client_id=None,
			oauth2_client_secret=None,
			access_token=None,
			access_token_expiration=None,
			refresh_token=None,
			url_authorize=None,
			url_token=None,
			url_queue=None,

			field_id="id",
			field_filename="filename",
			field_tags="tags",
			field_date="created",
			field_comment="comment",

			label_button_text="Queue",
			label_dialog_title="Files Available in Queue",
			label_dialog_instructions="Select a file from the pooled queue to upload to this printer&hellip;",

			upload_path="local",
			upload_include_comment=True,
			upload_print=False,
			upload_select=True
		)

	# ~~ TemplatePlugin

	def get_template_configs(self):
		return [
			dict(type="settings"),
			dict(
				type="generic",
				template="pooled_queue.jinja2"
			)
		]

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
				displayName="Pooled Queue Plugin",
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
