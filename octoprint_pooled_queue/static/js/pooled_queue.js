/*
 * View model for OctoPrint-PooledQueue
 *
 * Author: Seth Battis
 * License: AGPLv3
 */
$(function () {
    const PLUGIN_ID = 'pooled_queue';

    const PLUGIN_SELECTOR = `#plugin_${PLUGIN_ID}`
    const BINDINGS = {
        [`${PLUGIN_SELECTOR}_button`]: 'button',
        [`${PLUGIN_SELECTOR}_button_text`]: 'button_text',
        [`${PLUGIN_SELECTOR}_dialog`]: 'dialog',
        [`${PLUGIN_SELECTOR}_instructions`]: 'instructions',
        [`${PLUGIN_SELECTOR}_files_none`]: 'files_none',
        [`${PLUGIN_SELECTOR}_files_config`]: 'files_config',
        [`${PLUGIN_SELECTOR}_files_loading`]: 'files_loading',
        [`${PLUGIN_SELECTOR}_files_list`]: 'files_list',
        [`${PLUGIN_SELECTOR}_item_template`]: 'item_template'
    };

    function PooledQueueViewModel(parameters) {

        const self = this;

        self.button = undefined;
        self.button_text = undefined;
        self.dialog = undefined;
        self.instructions = undefined;
        self.files_none = undefined;
        self.files_config = undefined;
        self.files_loading = undefined;
        self.files_list = undefined;
        self.item_template = undefined;
        self.settings = undefined;

        const QUEUE_CONFIG = {
            cache: false,
            headers: {}
        }

        const API_CONFIG = {}
        if (UI_API_KEY) {
            API_CONFIG.headers = {'X-Api-Key': UI_API_KEY};
        }

        /**
         * https://stackoverflow.com/a/46427607
         */
        function build_path(...args) {
            return args.map((part, i) => {
                if (i === 0) {
                    return part.trim().replace(/[\/]*$/g, '')
                } else {
                    return part.trim().replace(/(^[\/]*|[\/]*$)/g, '')
                }
            }).filter(x => x.length).join('/')
        }

        function selectItem(item) {
            $(self.dialog).modal('hide');
            $.ajax({
                ...QUEUE_CONFIG,
                url: QUEUE_CONFIG.url + `/${item.id}`,
                xhr: () => {
                    const xhr = new XMLHttpRequest();
                    xhr.responseType = 'blob';
                    return xhr;
                },
                success: file => {
                    const data = new FormData();
                    if (self.settings['print']) {
                        data.append('print', 'true');
                    }
                    if (self.settings['select']) {
                        data.append('select', 'true');
                    }
                    if (self.settings['include_comment'] && item[self.settings['queue_comment_field']]) {
                        data.append('userdata', item[self.settings['queue_comment_field']]);
                    }
                    data.append('file', file, item[self.settings['queue_filename_field']]);
                    $.ajax({
                        ...API_CONFIG,
                        url: build_path('/api/files', self.settings['upload_path']),
                        method: 'POST',
                        data,
                        processData: false,
                        contentType: false,
                    });
                }
            });
        }

        function addItem(item) {
            const node = self.item_template.content.firstElementChild.cloneNode(true);
            const fields = {
                id: 'queue_id_field',
                filename: 'queue_filename_field',
                owner: 'queue_owner_field',
                date: 'queue_date_field',
                comment: 'queue_comment_field'
            }
            for (const field in fields) {
                if (self.settings[fields[field]] && item[self.settings[fields[field]]]) {
                    node.querySelector(`.${field}`).innerHTML += item[self.settings[fields[field]]];
                } else {
                    node.querySelector(`.${field}`).classList.add('hidden')
                }
            }
            node.addEventListener('click', selectItem.bind(self, item))
            return self.files_list.appendChild(node);
        }

        async function applySettings() {
            self.settings = await OctoPrint.settings.getPluginSettings(PLUGIN_ID);
            QUEUE_CONFIG.url = self.settings['queue_url'];
            if (self.settings['queue_token']) {
                QUEUE_CONFIG.headers = {
                    ...QUEUE_CONFIG.headers,
                    Authorization: `BEARER ${self.settings['queue_token']}`
                }
            }
            self.button_text.innerHTML = self.settings['button_text'];
            self.instructions = self.settings['instructions'];
        }

        self.showDialog = async function () {
            for (const node of self.dialog.querySelectorAll('.files')) {
                node.classList.add('hidden');
            }
            self.files_loading.classList.remove('hidden');

            $(self.dialog).modal('show')
            await applySettings();
            if (QUEUE_CONFIG.url) {
                $.ajax({
                    ...QUEUE_CONFIG,
                    success: files => {
                        if (files.length === 0) {
                            self.files_none.classList.remove('hidden');
                        } else {
                            self.files_list.classList.remove('hidden');
                        }
                        self.files_loading.classList.add('hidden');
                        self.files_list.innerHTML = "";
                        for (const item of files) {
                            addItem(item);
                        }
                    }
                })
            } else {
                self.files_config.classList.remove('hidden');
                self.files_loading.classList.add('hidden');
            }
        }

        /***************************************************************************************************************
         * Lifecycle event handlers
         */

        self.onBoundTo = function (target, element) {
            self[BINDINGS[target]] = document.querySelector(target);
            return element;
        }

        self.onStartupComplete = function () {
            applySettings();
            self.button.addEventListener('click', self.showDialog.bind(self));
            document.querySelector('.upload-buttons').append(self.button);
        }
    }

    OCTOPRINT_VIEWMODELS.push({
        construct: PooledQueueViewModel,
        elements: Object.keys(BINDINGS)
    });
});
