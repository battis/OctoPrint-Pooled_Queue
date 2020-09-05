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
        [`${PLUGIN_SELECTOR}_dialog`]: 'dialog',

        [`${PLUGIN_SELECTOR}_button_text`]: 'button_text',
        [`${PLUGIN_SELECTOR}_dialog_title`]: 'dialog_title',
        [`${PLUGIN_SELECTOR}_instructions`]: 'instructions',

        [`${PLUGIN_SELECTOR}_files_none`]: 'files_none',
        [`${PLUGIN_SELECTOR}_files_auth`]: 'files_auth',
        [`${PLUGIN_SELECTOR}_files_config`]: 'files_config',
        [`${PLUGIN_SELECTOR}_files_loading`]: 'files_loading',
        [`${PLUGIN_SELECTOR}_files_list`]: 'files_list',

        [`${PLUGIN_SELECTOR}_item_template`]: 'item_template'
    };

    function PooledQueueViewModel() {

        const self = this;

        self.button = undefined;
        self.button_text = undefined;
        self.dialog = undefined;
        self.dialog_title = undefined;
        self.instructions = undefined;
        self.files_none = undefined;
        self.files_config = undefined;
        self.files_auth = undefined;
        self.files_loading = undefined;
        self.files_list = undefined;
        self.item_template = undefined;

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

        async function authorize(settings, force = false) {
            if (force || false === !!settings['access_token']) {
                // FIXME will need to be updated to authorization code grant
                const form = new FormData();
                form.append('grant_type', 'client_credentials');
                form.append('client_id', settings['oauth2_client_id']);
                form.append('client_secret', settings['oauth2_client_secret']);
                const data = await (await fetch(settings['url_token'], {
                    method: 'POST',
                    body: form
                })).json();
                OctoPrint.settings.savePluginSettings(PLUGIN_ID, {
                    access_token: data.access_token
                });
                return data.access_token;
            }
            return settings['access_token'];
        }

        async function selectItem(item, settings) {
            $(self.dialog).modal('hide');

            const headers = {};
            if (settings['access_token']) {
                headers.Authorization = `Bearer ${settings['access_token']}`;
            }

            const file = await (await fetch(`${settings['url_queue']}/${item.id}`, {
                method: 'DELETE',
                headers: headers,
                credentials: 'include'
            })).blob();
            const data = new FormData();
            data.append('print', settings['upload_print']);
            data.append('select', settings['upload_select']);

            const userdata = {};
            if (item[settings['field_tags']]) {
                userdata.tags = item[settings['field_tags']];
            }
            if (settings['upload_include_comment'] && item[settings['field_comment']]) {
                userdata.comment = item[settings['field_comment']];
            }
            if (userdata.comment || userdata.tags) {
                data.append('userdata', JSON.stringify(userdata));
            }

            data.append('file', file, item[settings['field_filename']]);
            $.ajax({
                ...API_CONFIG,
                url: build_path('/api/files', settings['upload_path']),
                method: 'POST',
                data,
                processData: false,
                contentType: false,
            });
        }

        function addItem(item, settings) {
            const node = self.item_template.content.firstElementChild.cloneNode(true);
            const fields = {
                id: 'field_id',
                filename: 'field_filename',
                tags: 'field_tags',
                date: 'field_date',
                comment: 'field_comment'
            }
            for (const field in fields) {
                if (settings[fields[field]] && item[settings[fields[field]]]) {
                    if (field === 'date') {
                        item[settings[fields[field]]] = new Date(item[settings[fields[field]]]).toDateString();
                    }
                    node.querySelector(`.${field}`).innerHTML += item[settings[fields[field]]];
                } else {
                    node.querySelector(`.${field}`).classList.add('hidden')
                }
            }
            node.addEventListener('click', selectItem.bind(self, item, settings))
            return self.files_list.querySelector('ul').appendChild(node);
        }

        self.showDialog = async function () {
            for (const node of self.dialog.querySelectorAll('.files')) {
                node.classList.add('hidden');
            }
            self.files_loading.classList.remove('hidden');

            $(self.dialog).modal('show')
            const settings = await OctoPrint.settings.getPluginSettings(PLUGIN_ID);
            if (settings['url_queue']) {
                const headers = {};
                let retry = true;
                let refreshed = false;
                while (retry) {
                    retry = false;
                    if (settings['access_token']) {
                        headers.Authorization = `Bearer ${settings['access_token']}`;
                    }
                    const response = await fetch(settings['url_queue'], {
                        headers: headers,
                        credentials: 'include'
                    });
                    if (response.status === 200) {
                        const files = await response.json();
                        if (files.length === 0) {
                            self.files_none.classList.remove('hidden');
                        } else {
                            self.files_list.classList.remove('hidden');
                        }
                        self.files_loading.classList.add('hidden');
                        self.files_list.querySelector('ul').innerHTML = "";
                        for (const item of files) {
                            addItem(item, settings);
                        }
                    } else if (response.status === 401 && !refreshed) {
                        settings['access_token'] = await authorize(settings, true);
                        refreshed = true;
                        retry = true;
                    }
                }
            } else {
                self.files_config.classList.remove('hidden');
                self.files_loading.classList.add('hidden');
            }
        }

        /***************************************************************************************************************
         * Lifecycle event handlers
         */

        self.onBoundTo = function (target, element) {
            self[BINDINGS[target]] = element;
        }

        async function applySettings() {
            const settings = await OctoPrint.settings.getPluginSettings(PLUGIN_ID);
            await authorize(settings);
            self.button_text.innerHTML = settings['label_button_text'];
            self.instructions.innerHTML = settings['label_dialog_instructions'];
            self.dialog_title.innerHTML = settings['label_dialog_title'];
        }

        self.onStartupComplete = function () {
            applySettings();
            self.button.addEventListener('click', self.showDialog.bind(self));
            document.querySelector('.upload-buttons').append(self.button);
            for (const button of document.querySelectorAll('.upload-buttons .fileinput-button')) {
                button.classList.remove('span12');
                button.classList.add('span6');
            }
        }
    }

    OCTOPRINT_VIEWMODELS.push({
        construct: PooledQueueViewModel,
        elements: Object.keys(BINDINGS) // TODO do we really need to bind _everything_?
    });
});
