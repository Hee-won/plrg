const fs = require('fs');
const path = require('path');

// Input data
const inputData = `
101_1.0.0
algoliasearch-helper_3.6.0
arr-flatten-unflatten_1.1.4
asciitable.js_1.0.2
assign-deep_1.0.0
aurelia-path_1.1.7
aws-sdk-shared-ini-file-loader_1.0.0-rc.8
bmoor_0.8.11
bodymen_1.0.0
brikcss-merge_1.3.0
cached-path-relative_1.0.1
changeset_0.1.0
class-transformer_0.1.1
component-flatten_1.0.1
confinit_0.3.0
confucious_0.0.12
connie_0.1.0
controlled-merge_1.0.0
convict_6.0.0
cookiex-deep_0.0.6
copy-props_2.0.4
deap_1.0.0
decal_2.0.0
decal_2.1.3
deep-defaults_1.0.5
deep-extend_0.5.0
deep-get-set_1.1.0
deep-override_1.0.0
deep-set_1.0.0
deephas_1.0.5
deeply_3.0.0
deepmergefn_1.1.0
deepref_1.1.1
deeps_1.4.5
defaults-deep_0.2.0
defaults-deep_0.2.4
doc-path_2.0.0
dot-notes_3.2.0
dot-object_2.1.2
dot-prop_2.0.0
dotty_0.0.1
dset_1.0.0
eivifj-dot_1.0.2
eivindfjeldstad-dot_0.0.1
expand-hash_1.0.1
extend_3.0.1
extend-merge_1.0.5
fabiocaccamo-utils.js_0.17.0
fast-json-patch_2.0.4
field_1.0.1
firebase-util_0.3.2
firebase-util_0.3.3-canary.c47ba31d0
flat_5.0.0
flat-wrap_1.0.2
flattenizer_0.0.5
fluentui-styles_0.47.15
gammautils_0.0.81
gedi_1.6.3
getobject_0.1.0
getsetdeep_4.15.0
grunt-util-property_0.0.2
hoek_5.0.0
i18next_19.7.0
ianwalter-merge_9.0.1
immer_8.0.0
ini_1.3.5
ini-parser_0.0.2
iniparserjs_1.0.4
inireader_1.0.0
ion-parser_0.5.2
jointjs_2.2.1
jointjs_3.4.0
jquery_1.11.0
js-data_3.0.9
js-extend_0.0.1
js-ini_1.2.0
json-pointer_0.6.0
json-pointer_0.6.1
json-ptr_1.1.0
json-schema_0.3.0
json8-merge-patch_1.0.1
jsonpointer_4.0.0
just-extend_3.0.0
just-safe-set_1.0.0
keyd_1.3.4
keyget_2.2.0
libnested_1.5.0
linux-cmdline_1.0.0
locutus_2.0.11
lodash_4.17.9
lodash_4.17.10
lodash_4.17.11
lodash_4.17.15
lutils_2.4.0
lutils-merge_0.2.6
lyngs-digger_1.0.7
lyngs-merge_1.0.9
madlib-object-utils_0.1.6
mathjs_7.4.0
merge_2.1.0
merge-change_1.0.1
merge-deep_3.0.0
merge-deep2_3.0.5
merge-objects_1.0.3
merge-options_1.0.0
merge-recursive_0.0.3
mergify_1.0.2
minimist_1.0.0
mithril_1.0.0
mixin-deep_1.3.0
mixin-deep_2.0.0
mootools_1.5.2
mout_1.0.0
mpath_0.4.1
mquery_3.2.1
multi-ini_2.1.0
nconf-toml_0.0.1
nedb_1.8.0
nested-object-assign_1.0.3
nested-property_0.0.5
nestie_1.0.0
nis-utils_0.6.10
node-dig_1.0.1
node-extend_1.0.0
node-forge_0.9.0
node-ini_1.0.0
node-oojs_1.4.0
nodee-utils_1.2.2
object-collider_1.0.3
object-path_0.11.0
object-path_0.11.4
object-path-set_1.0.0
objection_2.0.0
objnest_5.0.0
objtools_3.0.0
objutil_2.17.3
patchmerge_1.0.0
patchmerge_1.0.1
pathval_1.1.0
paypal-adaptive_0.4.1
phpjs_1.3.2
plain-object-merge_1.0.1
predefine_0.1.2
promisehelpers_0.0.5
properties-reader_2.0.0
property-expr_2.0.2
Proto_1.1.4
prototyped.js_2.0.0
putil-merge_3.0.0
querymen_2.1.3
rdf-graph-array_0.3.0
record-like-deep-assign_1.0.1
rfc6902_4.0.2
safe-flat_2.0.0
safe-obj_1.0.0
safe-object2_1.0.3
safetydance_2.0.1
sahmat_1.0.0
sds_3.2.0
set-deep-prop_1.0.0
set-getter_0.1.0
set-in_1.0.0
set-object-value_0.0.5
set-or-get_1.2.10
set-value_3.0.0
shvl_2.0.1
simpl-schema_1.10.0
smart-extend_1.7.3
strikeentco-set_1.0.0
style-dictionary_2.10.2
supermixer_1.0.3
swiper_6.5.0
Templ8_0.7.0
think-config_1.0.0
think-helper_1.1.0
tiny-conf_1.1.0
total.js_3.4.6
tree-kit_0.6.1
ts-dot-prop_1.4.0
tsed-core_5.62.3
typeorm_0.2.24
uifabric-utilities_7.20.2
undefsafe_2.0.2
upmerge_0.1.7
utilitify_1.0.2
utils-extend_1.0.8
vega-util_1.13.0
viking04-merge_1.0.0
worksmith_1.0.0
x-assign_0.1.4
y18n_3.2.1
yargs-parser_6.0.0
`;

// Parse the input data
const lines = inputData.trim().split('\n');
lines.map(line => {
    const [name, version] = line.split('_');
    const outputDir = path.join(__dirname);
    const outputPath = path.join(outputDir, `${line}_output.json`);
    const output = {
        "id": 'CVE',
        upstream: `${name}@${version}`,
        "keymethod": "",
        "keystring": "",
        "location": "",
        "downstream": [],
    };
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }
    fs.writeFileSync(outputPath, JSON.stringify(output, null, 2), 'utf8');
});
