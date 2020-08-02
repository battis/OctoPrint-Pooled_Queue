# coding=utf-8
from __future__ import absolute_import

from octoprint_pooled_queue.plugin import PooledQueuePlugin

__plugin_name__ = "Pooled Queue"
__plugin_pythoncompat__ = ">=2.7,<4"  # python 2 and 3


def __plugin_load__():
	# noinspection PyGlobalUndefined
	global __plugin_implementation__
	__plugin_implementation__ = PooledQueuePlugin()

	# noinspection PyGlobalUndefined
	global __plugin_hooks__
	__plugin_hooks__ = {
		"octoprint.plugin.softwareupdate.check_config": __plugin_implementation__.get_update_information
	}
