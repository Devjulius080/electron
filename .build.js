import("//build/config/locales.gni")
import("//build/config/ui.gni")
import("//build/config/win/manifest.gni")
import("//components/os_crypt/features.gni")
import("//components/spellcheck/spellcheck_build_features.gni")
import("//content/public/app/mac_helpers.gni")
import("//extensions/buildflags/buildflags.gni")
import("//pdf/features.gni")
import("//ppapi/buildflags/buildflags.gni")
import("//printing/buildflags/buildflags.gni")
import("//testing/test.gni")
import("//third_party/ffmpeg/ffmpeg_options.gni")
import("//tools/generate_library_loader/generate_library_loader.gni")
import("//tools/grit/grit_rule.gni")
import("//tools/grit/repack.gni")
import("//tools/v8_context_snapshot/v8_context_snapshot.gni")
import("//v8/gni/snapshot_toolchain.gni")
import("build/asar.gni")
import("build/extract_symbols.gni")
import("build/npm.gni")
import("build/templated_file.gni")
import("build/tsc.gni")
import("build/webpack/webpack.gni")
import("buildflags/buildflags.gni")
import("electron_paks.gni")
import("filenames.auto.gni")
import("filenames.gni")
import("filenames.hunspell.gni")
import("filenames.libcxx.gni")
import("filenames.libcxxabi.gni")

if (is_mac) {
  import("//build/config/mac/rules.gni")
  import("//third_party/icu/config.gni")
  import("//ui/gl/features.gni")
  import("//v8/gni/v8.gni")
  import("build/rules.gni")

  assert(
      mac_deployment_target == "10.13",
      "Chromium has updated the mac_deployment_target, please update this assert, update the supported versions documentation (docs/tutorial/support.md) and flag this as a breaking change")
}

if (is_linux) {
  import("//build/config/linux/pkg_config.gni")
  import("//tools/generate_stubs/rules.gni")

  pkg_config("gio_unix") {
    packages = [ "gio-unix-2.0" ]
  }

  pkg_config("libnotify_config") {
    packages = [
      "glib-2.0",
      "gdk-pixbuf-2.0",
    ]
  }

  generate_library_loader("libnotify_loader") {
    name = "LibNotifyLoader"
    output_h = "libnotify_loader.h"
    output_cc = "libnotify_loader.cc"
    header = "<libnotify/notify.h>"
    config = ":libnotify_config"

    functions = [
      "notify_is_initted",
      "notify_init",
      "notify_get_server_caps",
      "notify_get_server_info",
      "notify_notification_new",
      "notify_notification_add_action",
      "notify_notification_set_image_from_pixbuf",
      "notify_notification_set_timeout",
      "notify_notification_set_urgency",
      "notify_notification_set_hint_string",
      "notify_notification_show",
      "notify_notification_close",
    ]
  }

  # Generates electron_gtk_stubs.h header which contains
  # stubs for extracting function ptrs from the gtk library.
  # Function signatures for which stubs are required should be
  # declared in electron_gtk.sigs, currently this file contains
  # signatures for the functions used with native file chooser
  # implementation. In future, this file can be extended to contain
  # gtk4 stubs to switch gtk version in runtime.
  generate_stubs("electron_gtk_stubs") {
    sigs = [
      "shell/browser/ui/electron_gdk_pixbuf.sigs",
      "shell/browser/ui/electron_gtk.sigs",
    ]
    extra_header = "shell/browser/ui/electron_gtk.fragment"
    output_name = "electron_gtk_stubs"
    public_deps = [ "//ui/gtk:gtk_config" ]
    logging_function = "LogNoop()"
    logging_include = "ui/gtk/log_noop.h"
  }
}

declare_args() {
  use_prebuilt_v8_context_snapshot = false
}

branding = read_file("shell/app/BRANDING.json", "json")
electron_project_name = branding.project_name
electron_product_name = branding.product_name
electron_mac_bundle_id = branding.mac_bundle_id
electron_version = exec_script("script/print-version.py",
                               [],
                               "trim string",
                               [
                                 ".git/packed-refs",
                                 ".git/HEAD",
                                 "script/lib/get-version.js",
                               ])

if (is_mas_build) {
  assert(is_mac,
         "It doesn't make sense to build a MAS build on a non-mac platform")
}

if (enable_pdf_viewer) {
  assert(enable_pdf, "PDF viewer support requires enable_pdf=true")
  assert(enable_electron_extensions,
         "PDF viewer support requires enable_electron_extensions=true")
}

if (enable_electron_extensions) {
  assert(enable_extensions,
         "Chrome extension support requires enable_extensions=true")
}

config("branding") {
  defines = [
    "ELECTRON_PRODUCT_NAME=\"$electron_product_name\"",
    "ELECTRON_PROJECT_NAME=\"$electron_project_name\"",
  ]
}

config("electron_lib_config") {
  include_dirs = [ "." ]
}

# We generate the definitions twice here, once in //electron/electron.d.ts
# and once in $target_gen_dir
# The one in $target_gen_dir is used for the actual TSC build later one
# and the one in //electron/electron.d.ts is used by your IDE (vscode)
# for typescript prompting
npm_action("build_electron_definitions") {
  script = "gn-typescript-definitions"
  args = [ rebase_path("$target_gen_dir/tsc/typings/electron.d.ts") ]
  inputs = auto_filenames.api_docs + [ "yarn.lock" ]

  outputs = [ "$target_gen_dir/tsc/typings/electron.d.ts" ]
}

webpack_build("electron_asar_bundle") {
  deps = [ ":build_electron_definitions" ]

  inputs = auto_filenames.asar_bundle_deps

  config_file = "//electron/build/webpack/webpack.config.asar.js"
  out_file = "$target_gen_dir/js2c/asar_bundle.js"
}

webpack_build("electron_browser_bundle") {
  deps = [ ":build_electron_definitions" ]

  inputs = auto_filenames.browser_bundle_deps

  config_file = "//electron/build/webpack/webpack.config.browser.js"
  out_file = "$target_gen_dir/js2c/browser_init.js"
}

webpack_build("electron_renderer_bundle") {
  deps = [ ":build_electron_definitions" ]

  inputs = auto_filenames.renderer_bundle_deps

  config_file = "//electron/build/webpack/webpack.config.renderer.js"
  out_file = "$target_gen_dir/js2c/renderer_init.js"
}

webpack_build("electron_worker_bundle") {
  deps = [ ":build_electron_definitions" ]

  inputs = auto_filenames.worker_bundle_deps

  config_file = "//electron/build/webpack/webpack.config.worker.js"
  out_file = "$target_gen_dir/js2c/worker_init.js"
}

webpack_build("electron_sandboxed_renderer_bundle") {
  deps = [ ":build_electron_definitions" ]

  inputs = auto_filenames.sandbox_bundle_deps

  config_file = "//electron/build/webpack/webpack.config.sandboxed_renderer.js"
  out_file = "$target_gen_dir/js2c/sandbox_bundle.js"
}

webpack_build("electron_isolated_renderer_bundle") {
  deps = [ ":build_electron_definitions" ]

  inputs = auto_filenames.isolated_bundle_deps

  config_file = "//electron/build/webpack/webpack.config.isolated_renderer.js"
  out_file = "$target_gen_dir/js2c/isolated_bundle.js"
}

webpack_build("electron_utility_bundle") {
  deps = [ ":build_electron_definitions" ]

  inputs = auto_filenames.utility_bundle_deps

  config_file = "//electron/build/webpack/webpack.config.utility.js"
  out_file = "$target_gen_dir/js2c/utility_init.js"
}

action("electron_js2c") {
  deps = [
    ":electron_asar_bundle",
    ":electron_browser_bundle",
    ":electron_isolated_renderer_bundle",
    ":electron_renderer_bundle",
    ":electron_sandboxed_renderer_bundle",
    ":electron_utility_bundle",
    ":electron_worker_bundle",
  ]

  sources = [
    "$target_gen_dir/js2c/asar_bundle.js",
    "$target_gen_dir/js2c/browser_init.js",
    "$target_gen_dir/js2c/isolated_bundle.js",
    "$target_gen_dir/js2c/renderer_init.js",
    "$target_gen_dir/js2c/sandbox_bundle.js",
    "$target_gen_dir/js2c/utility_init.js",
    "$target_gen_dir/js2c/worker_init.js",
  ]

  inputs = sources + [ "//third_party/electron_node/tools/js2c.py" ]
  outputs = [ "$root_gen_dir/electron_natives.cc" ]

  script = "build/js2c.py"
  args = [ rebase_path("//third_party/electron_node") ] +
         rebase_path(outputs, root_build_dir) +
         rebase_path(sources, root_build_dir)
}

action("generate_config_gypi") {
  outputs = [ "$root_gen_dir/config.gypi" ]
  script = "script/generate-config-gypi.py"
  inputs = [ "//third_party/electron_node/configure.py" ]
  args = rebase_path(outputs) + [ target_cpu ]
}

target_gen_default_app_js = "$target_gen_dir/js/default_app"

typescript_build("default_app_js") {
  deps = [ ":build_electron_definitions" ]

  sources = filenames.default_app_ts_sources

  output_gen_dir = target_gen_default_app_js
  output_dir_name = "default_app"
  tsconfig = "tsconfig.default_app.json"
}

copy("default_app_static") {
  sources = filenames.default_app_static_sources
  outputs = [ "$target_gen_default_app_js/{{source}}" ]
}

copy("default_app_octicon_deps") {
  sources = filenames.default_app_octicon_sources
  outputs = [ "$target_gen_default_app_js/electron/default_app/octicon/{{source_file_part}}" ]
}

asar("default_app_asar") {
  deps = [
    ":default_app_js",
    ":default_app_octicon_deps",
    ":default_app_static",
  ]

  root = "$target_gen_default_app_js/electron/default_app"
  sources = get_target_outputs(":default_app_js") +
            get_target_outputs(":default_app_static") +
            get_target_outputs(":default_app_octicon_deps")
  outputs = [ "$root_out_dir/resources/default_app.asar" ]
}

grit("resources") {
  source = "electron_resources.grd"

  outputs = [
    "grit/electron_resources.h",
    "electron_resources.pak",
  ]

  # Mojo manifest overlays are generated.
  grit_flags = [
    "-E",
    "target_gen_dir=" + rebase_path(target_gen_dir, root_build_dir),
  ]

  deps = [ ":copy_shell_devtools_discovery_page" ]

  output_dir = "$target_gen_dir"
}

copy("copy_shell_devtools_discovery_page") {
  sources = [ "//content/shell/resources/shell_devtools_discovery_page.html" ]
  outputs = [ "$target_gen_dir/shell_devtools_discovery_page.html" ]
}

npm_action("electron_version_args") {
  script = "generate-version-json"

  outputs = [ "$target_gen_dir/electron_version.args" ]

  args = rebase_path(outputs) + [ "$electron_version" ]

  inputs = [ "script/generate-version-json.js" ]
}

templated_file("electron_version_header") {
  deps = [ ":electron_version_args" ]

  template = "build/templates/electron_version.tmpl"
  output = "$target_gen_dir/electron_version.h"

  args_files = get_target_outputs(":electron_version_args")
}

templated_file("electron_win_rc") {
  deps = [ ":electron_version_args" ]

  template = "build/templates/electron_rc.tmpl"
  output = "$target_gen_dir/win-resources/electron.rc"

  args_files = get_target_outputs(":electron_version_args")
}

copy("electron_win_resource_files") {
  sources = [
    "shell/browser/resources/win/electron.ico",
    "shell/browser/resources/win/resource.h",
  ]
  outputs = [ "$target_gen_dir/win-resources/{{source_file_part}}" ]
}

templated_file("electron_version_file") {
  deps = [ ":electron_version_args" ]

  template = "build/templates/version_string.tmpl"
  output = "$root_build_dir/version"

  args_files = get_target_outputs(":electron_version_args")
}

group("electron_win32_resources") {
  public_deps = [
    ":electron_win_rc",
    ":electron_win_resource_files",
  ]
}

action("electron_fuses") {
  script = "build/fuses/build.py"

  inputs = [ "build/fuses/fuses.json5" ]

  outputs = [
    "$target_gen_dir/fuses.h",
    "$target_gen_dir/fuses.cc",
  ]

  args = rebase_path(outputs)
}

action("electron_generate_node_defines") {
  script = "build/generate_node_defines.py"

  inputs = [
    "//third_party/electron_node/src/tracing/trace_event_common.h",
    "//third_party/electron_node/src/tracing/trace_event.h",
    "//third_party/electron_node/src/util.h",
  ]

  outputs = [
    "$target_gen_dir/push_and_undef_node_defines.h",
    "$target_gen_dir/pop_node_defines.h",
  ]

  args = [ rebase_path(target_gen_dir) ] + rebase_path(inputs)
}

source_set("electron_lib") {
  configs += [ "//v8:external_startup_data" ]
  configs += [ "//third_party/electron_node:node_internals" ]

  public_configs = [
    ":branding",
    ":electron_lib_config",
  ]

  deps = [
    ":electron_fuses",
    ":electron_generate_node_defines",
    ":electron_js2c",
    ":electron_version_header",
    ":resources",
    "buildflags",
    "chromium_src:chrome",
    "chromium_src:chrome_spellchecker",
    "shell/common/api:mojo",
    "shell/services/node/public/mojom",
    "//base:base_static",
    "//base/allocator:buildflags",
    "//chrome:strings",
    "//chrome/app:command_ids",
    "//chrome/app/resources:platform_locale_settings",
    "//components/autofill/core/common:features",
    "//components/certificate_transparency",
    "//components/embedder_support:browser_util",
    "//components/language/core/browser",
    "//components/net_log",
    "//components/network_hints/browser",
    "//components/network_hints/common:mojo_bindings",
    "//components/network_hints/renderer",
    "//components/network_session_configurator/common",
    "//components/omnibox/browser:buildflags",
    "//components/os_crypt",
    "//components/pref_registry",
    "//components/prefs",
    "//components/security_state/content",
    "//components/upload_list",
    "//components/user_prefs",
    "//components/viz/host",
    "//components/viz/service",
    "//components/webrtc",
    "//content/public/browser",
    "//content/public/child",
    "//content/public/gpu",
    "//content/public/renderer",
    "//content/public/utility",
    "//device/bluetooth",
    "//device/bluetooth/public/cpp",
    "//gin",
    "//media/capture/mojom:video_capture",
    "//media/mojo/mojom",
    "//net:extras",
    "//net:net_resources",
    "//printing/buildflags",
    "//services/device/public/cpp/geolocation",
    "//services/device/public/cpp/hid",
    "//services/device/public/mojom",
    "//services/proxy_resolver:lib",
    "//services/video_capture/public/mojom:constants",
    "//services/viz/privileged/mojom/compositing",
    "//skia",
    "//third_party/blink/public:blink",
    "//third_party/blink/public:blink_devtools_inspector_resources",
    "//third_party/blink/public/platform/media",
    "//third_party/boringssl",
    "//third_party/electron_node:node_lib",
    "//third_party/inspector_protocol:crdtp",
    "//third_party/leveldatabase",
    "//third_party/libyuv",
    "//third_party/webrtc_overrides:webrtc_component",
    "//third_party/widevine/cdm:headers",
    "//third_party/zlib/google:zip",
    "//ui/base/idle",
    "//ui/events:dom_keycode_converter",
    "//ui/gl",
    "//ui/native_theme",
    "//ui/shell_dialogs",
    "//ui/views",
    "//v8",
    "//v8:v8_libplatform",
  ]

  public_deps = [
    "//base",
    "//base:i18n",
    "//content/public/app",
  ]

  include_dirs = [
    ".",
    "$target_gen_dir",

    # TODO(nornagon): replace usage of SchemeRegistry by an actually exported
    # API of blink, then remove this from the include_dirs.
    "//third_party/blink/renderer",
  ]

  defines = [ "V8_DEPRECATION_WARNINGS" ]
  libs = []

  if (is_linux) {
    defines += [ "GDK_DISABLE_DEPRECATION_WARNINGS" ]
  }

  if (!is_mas_build) {
    deps += [
      "//components/crash/core/app",
      "//components/crash/core/browser",
    ]
  }

  configs += [ "//electron/build/config:mas_build" ]

  sources = filenames.lib_sources
  if (is_win) {
    sources += filenames.lib_sources_win
  }
  if (is_mac) {
    sources += filenames.lib_sources_mac
  }
  if (is_posix) {
    sources += filenames.lib_sources_posix
  }
  if (is_linux) {
    sources += filenames.lib_sources_linux
  }
  if (!is_mac) {
    sources += filenames.lib_sources_views
  }

  if (is_component_build) {
    defines += [ "NODE_SHARED_MODE" ]
  }

  if (enable_fake_location_provider) {
    sources += [
      "shell/browser/fake_location_provider.cc",
      "shell/browser/fake_location_provider.h",
    ]
  }

  if (is_mac) {
    deps += [
      "//components/remote_cocoa/app_shim",
      "//components/remote_cocoa/browser",
      "//content/common:mac_helpers",
      "//ui/accelerated_widget_mac",
    ]

    if (!is_mas_build) {
      deps += [ "//third_party/crashpad/crashpad/client" ]
    }

    frameworks = [
      "AVFoundation.framework",
      "Carbon.framework",
      "LocalAuthentication.framework",
      "QuartzCore.framework",
      "Quartz.framework",
      "Security.framework",
      "SecurityInterface.framework",
      "ServiceManagement.framework",
      "StoreKit.framework",
    ]

    weak_frameworks = [ "QuickLookThumbnailing.framework" ]

    sources += [
      "shell/browser/ui/views/autofill_popup_view.cc",
      "shell/browser/ui/views/autofill_popup_view.h",
    ]
    if (is_mas_build) {
      sources += [ "shell/browser/api/electron_api_app_mas.mm" ]
      sources -= [ "shell/browser/auto_updater_mac.mm" ]
      sources -= [
        "shell/app/electron_crash_reporter_client.cc",
        "shell/app/electron_crash_reporter_client.h",
        "shell/common/crash_keys.cc",
        "shell/common/crash_keys.h",
      ]
    } else {
      frameworks += [
        "Squirrel.framework",
        "ReactiveObjC.framework",
        "Mantle.framework",
      ]

      deps += [
        "//third_party/squirrel.mac:reactiveobjc_framework+link",
        "//third_party/squirrel.mac:squirrel_framework+link",
      ]

      # ReactiveObjC which is used by Squirrel requires using __weak.
      cflags_objcc = [ "-fobjc-weak" ]
    }
  }
  if (is_linux) {
    libs = [ "xshmfence" ]
    deps += [
      ":electron_gtk_stubs",
      ":libnotify_loader",
      "//build/config/linux/gtk",
      "//components/crash/content/browser",
      "//dbus",
      "//device/bluetooth",
      "//third_party/crashpad/crashpad/client",
      "//ui/base/ime/linux",
      "//ui/events/devices/x11",
      "//ui/events/platform/x11",
      "//ui/gtk:gtk_config",
      "//ui/linux:linux_ui",
      "//ui/linux:linux_ui_factory",
      "//ui/views/controls/webview",
      "//ui/wm",
    ]
    if (ozone_platform_x11) {
      sources += filenames.lib_sources_linux_x11
      public_deps += [
        "//ui/base/x",
        "//ui/ozone/platform/x11",
      ]
    }
    configs += [ ":gio_unix" ]
    defines += [
      # Disable warnings for g_settings_list_schemas.
      "GLIB_DISABLE_DEPRECATION_WARNINGS",
    ]

    sources += [
      "shell/browser/certificate_manager_model.cc",
      "shell/browser/certificate_manager_model.h",
      "shell/browser/ui/gtk/menu_util.cc",
      "shell/browser/ui/gtk/menu_util.h",
      "shell/browser/ui/gtk_util.cc",
      "shell/browser/ui/gtk_util.h",
    ]
  }
  if (is_win) {
    libs += [ "dwmapi.lib" ]
    deps += [
      "//components/crash/core/app:crash_export_thunks",
      "//ui/native_theme:native_theme_browser",
      "//ui/views/controls/webview",
      "//ui/wm",
      "//ui/wm/public",
    ]
    public_deps += [
      "//sandbox/win:sandbox",
      "//third_party/crashpad/crashpad/handler",
    ]
  }

  if (enable_plugins) {
    deps += [ "chromium_src:plugins" ]
    sources += [
      "shell/common/plugin_info.cc",
      "shell/common/plugin_info.h",
      "shell/renderer/electron_renderer_pepper_host_factory.cc",
      "shell/renderer/electron_renderer_pepper_host_factory.h",
      "shell/renderer/pepper_helper.cc",
      "shell/renderer/pepper_helper.h",
    ]
  }

  if (enable_ppapi) {
    deps += [
      "//ppapi/host",
      "//ppapi/proxy",
      "//ppapi/shared_impl",
    ]
  }

  if (enable_run_as_node) {
    sources += [
      "shell/app/node_main.cc",
      "shell/app/node_main.h",
    ]
  }

  if (enable_osr) {
    sources += [
      "shell/browser/osr/osr_host_display_client.cc",
      "shell/browser/osr/osr_host_display_client.h",
      "shell/browser/osr/osr_render_widget_host_view.cc",
      "shell/browser/osr/osr_render_widget_host_view.h",
      "shell/browser/osr/osr_video_consumer.cc",
      "shell/browser/osr/osr_video_consumer.h",
      "shell/browser/osr/osr_view_proxy.cc",
      "shell/browser/osr/osr_view_proxy.h",
      "shell/browser/osr/osr_web_contents_view.cc",
      "shell/browser/osr/osr_web_contents_view.h",
    ]
    if (is_mac) {
      sources += [
        "shell/browser/osr/osr_host_display_client_mac.mm",
        "shell/browser/osr/osr_web_contents_view_mac.mm",
      ]
    }
    deps += [
      "//components/viz/service",
      "//services/viz/public/mojom",
      "//ui/compositor",
    ]
  }

  if (enable_desktop_capturer) {
    sources += [
      "shell/browser/api/electron_api_desktop_capturer.cc",
      "shell/browser/api/electron_api_desktop_capturer.h",
    ]
  }

  if (enable_views_api) {
    sources += [
      "shell/browser/api/views/electron_api_image_view.cc",
      "shell/browser/api/views/electron_api_image_view.h",
    ]
  }

  if (enable_printing) {
    sources += [
      "shell/browser/printing/print_view_manager_electron.cc",
      "shell/browser/printing/print_view_manager_electron.h",
      "shell/renderer/printing/print_render_frame_helper_delegate.cc",
      "shell/renderer/printing/print_render_frame_helper_delegate.h",
    ]
    deps += [
      "//chrome/services/printing/public/mojom",
      "//components/printing/common:mojo_interfaces",
    ]
    if (is_mac) {
      deps += [ "//chrome/services/mac_notifications/public/mojom" ]
    }
  }

  if (enable_electron_extensions) {
    sources += filenames.lib_sources_extensions
    deps += [
      "shell/browser/extensions/api:api_registration",
      "shell/common/extensions/api",
      "shell/common/extensions/api:extensions_features",
      "//chrome/browser/resources:component_extension_resources",
      "//components/update_client:update_client",
      "//components/zoom",
      "//extensions/browser",
      "//extensions/browser/api:api_provider",
      "//extensions/browser/updater",
      "//extensions/common",
      "//extensions/common:core_api_provider",
      "//extensions/renderer",
    ]
  }

  if (enable_pdf) {
    # Printing depends on some //pdf code, so it needs to be built even if the
    # pdf viewer isn't enabled.
    deps += [
      "//pdf",
      "//pdf:features",
    ]
  }
  if (enable_pdf_viewer) {
    deps += [
      "//chrome/browser/resources/pdf:resources",
      "//components/pdf/browser",
      "//components/pdf/browser:interceptors",
      "//components/pdf/common",
      "//components/pdf/renderer",
      "//pdf",
    ]
    sources += [
      "shell/browser/electron_pdf_web_contents_helper_client.cc",
      "shell/browser/electron_pdf_web_contents_helper_client.h",
    ]
  }

  sources += get_target_outputs(":electron_fuses")

  if (allow_runtime_configurable_key_storage) {
    defines += [ "ALLOW_RUNTIME_CONFIGURABLE_KEY_STORAGE" ]
  }
}

electron_paks("packed_resources") {
  if (is_mac) {
    output_dir = "$root_gen_dir/electron_repack"
    copy_data_to_bundle = true
  } else {
    output_dir = root_out_dir
  }
}

if (is_mac) {
  electron_framework_name = "$electron_product_name Framework"
  electron_helper_name = "$electron_product_name Helper"
  electron_login_helper_name = "$electron_product_name Login Helper"
  electron_framework_version = "A"

  mac_xib_bundle_data("electron_xibs") {
    sources = [ "shell/common/resources/mac/MainMenu.xib" ]
  }

  action("fake_v8_context_snapshot_generator") {
    script = "build/fake_v8_context_snapshot_generator.py"
    args = [
      rebase_path("$root_out_dir/$v8_context_snapshot_filename"),
      rebase_path("$root_out_dir/fake/$v8_context_snapshot_filename"),
    ]
    outputs = [ "$root_out_dir/fake/$v8_context_snapshot_filename" ]
  }

  bundle_data("electron_framework_resources") {
    public_deps = [ ":packed_resources" ]
    sources = []
    if (icu_use_data_file) {
      sources += [ "$root_out_dir/icudtl.dat" ]
      public_deps += [ "//third_party/icu:icudata" ]
    }
    if (v8_use_external_startup_data) {
      public_deps += [ "//v8" ]
      if (use_v8_context_snapshot) {
        if (use_prebuilt_v8_context_snapshot) {
          sources += [ "$root_out_dir/fake/$v8_context_snapshot_filename" ]
          public_deps += [ ":fake_v8_context_snapshot_generator" ]
        } else {
          sources += [ "$root_out_dir/$v8_context_snapshot_filename" ]
          public_deps += [ "//tools/v8_context_snapshot" ]
        }
      } else {
        sources += [ "$root_out_dir/snapshot_blob.bin" ]
      }
    }
    outputs = [ "{{bundle_resources_dir}}/{{source_file_part}}" ]
  }

  if (!is_component_build && is_component_ffmpeg) {
    bundle_data("electron_framework_libraries") {
      sources = []
      public_deps = []
      sources += [ "$root_out_dir/libffmpeg.dylib" ]
      public_deps += [ "//third_party/ffmpeg:ffmpeg" ]
      outputs = [ "{{bundle_contents_dir}}/Libraries/{{source_file_part}}" ]
    }
  } else {
    group("electron_framework_libraries") {
    }
  }
  if (use_egl) {
    # Add the ANGLE .dylibs in the Libraries directory of the Framework.
    bundle_data("electron_angle_binaries") {
      sources = [
        "$root_out_dir/egl_intermediates/libEGL.dylib",
        "$root_out_dir/egl_intermediates/libGLESv2.dylib",
      ]
      outputs = [ "{{bundle_contents_dir}}/Libraries/{{source_file_part}}" ]
      public_deps = [ "//ui/gl:angle_library_copy" ]
    }

    # Add the SwiftShader .dylibs in the Libraries directory of the Framework.
    bundle_data("electron_swiftshader_binaries") {
      sources = [
        "$root_out_dir/vk_intermediates/libvk_swiftshader.dylib",
        "$root_out_dir/vk_intermediates/vk_swiftshader_icd.json",
      ]
      outputs = [ "{{bundle_contents_dir}}/Libraries/{{source_file_part}}" ]
      public_deps = [ "//ui/gl:swiftshader_vk_library_copy" ]
    }
  }
  group("electron_angle_library") {
    if (use_egl) {
      deps = [ ":electron_angle_binaries" ]
    }
  }

  group("electron_swiftshader_library") {
    if (use_egl) {
      deps = [ ":electron_swiftshader_binaries" ]
    }
  }

  bundle_data("electron_crashpad_helper") {
    sources = [ "$root_out_dir/chrome_crashpad_handler" ]

    outputs = [ "{{bundle_contents_dir}}/Helpers/{{source_file_part}}" ]

    public_deps = [ "//components/crash/core/app:chrome_crashpad_handler" ]

    if (is_asan) {
      # crashpad_handler requires the ASan runtime at its @executable_path.
      sources += [ "$root_out_dir/libclang_rt.asan_osx_dynamic.dylib" ]
      public_deps += [ "//build/config/sanitizers:copy_asan_runtime" ]
    }
  }

  mac_framework_bundle("electron_framework") {
    output_name = electron_framework_name
    framework_version = electron_framework_version
    framework_contents = [
      "Resources",
      "Libraries",
    ]
    if (!is_mas_build) {
      framework_contents += [ "Helpers" ]
    }
    public_deps = [
      ":electron_framework_libraries",
      ":electron_lib",
    ]
    deps = [
      ":electron_angle_library",
      ":electron_framework_libraries",
      ":electron_framework_resources",
      ":electron_swiftshader_library",
      ":electron_xibs",
    ]
    if (!is_mas_build) {
      deps += [ ":electron_crashpad_helper" ]
    }
    info_plist = "shell/common/resources/mac/Info.plist"

    extra_substitutions = [
      "ELECTRON_BUNDLE_ID=$electron_mac_bundle_id.framework",
      "ELECTRON_VERSION=$electron_version",
    ]

    include_dirs = [ "." ]
    sources = filenames.framework_sources
    frameworks = []

    if (enable_osr) {
      frameworks += [ "IOSurface.framework" ]
    }

    ldflags = [
      "-Wl,-install_name,@rpath/$output_name.framework/$output_name",
      "-rpath",
      "@loader_path/Libraries",

      # Required for exporting all symbols of libuv.
      "-Wl,-force_load,obj/third_party/electron_node/deps/uv/libuv.a",
    ]
    if (is_component_build) {
      ldflags += [
        "-rpath",
        "@executable_path/../../../../../..",
      ]
    }

    # For component ffmpeg under non-component build, it is linked from
    # @loader_path. However the ffmpeg.dylib is moved to a different place
    # when generating app bundle, and we should change to link from @rpath.
    if (is_component_ffmpeg && !is_component_build) {
      ldflags += [ "-Wcrl,installnametool,-change,@loader_path/libffmpeg.dylib,@rpath/libffmpeg.dylib" ]
    }
  }

  template("electron_helper_app") {
    mac_app_bundle(target_name) {
      assert(defined(invoker.helper_name_suffix))

      output_name = electron_helper_name + invoker.helper_name_suffix
      deps = [
        ":electron_framework+link",
        "//base/allocator:early_zone_registration_mac",
      ]
      if (!is_mas_build) {
        deps += [ "//sandbox/mac:seatbelt" ]
      }
      defines = [ "HELPER_EXECUTABLE" ]
      extra_configs = [ "//electron/build/config:mas_build" ]
      sources = [
        "shell/app/electron_main_mac.cc",
        "shell/app/uv_stdio_fix.cc",
        "shell/app/uv_stdio_fix.h",
        "shell/common/electron_constants.cc",
      ]
      include_dirs = [ "." ]
      info_plist = "shell/renderer/resources/mac/Info.plist"
      extra_substitutions =
          [ "ELECTRON_BUNDLE_ID=$electron_mac_bundle_id.helper" ]
      ldflags = [
        "-rpath",
        "@executable_path/../../..",
      ]
      if (is_component_build) {
        ldflags += [
          "-rpath",
          "@executable_path/../../../../../..",
        ]
      }
    }
  }

  foreach(helper_params, content_mac_helpers) {
    _helper_target = helper_params[0]
    _helper_bundle_id = helper_params[1]
    _helper_suffix = helper_params[2]
    electron_helper_app("electron_helper_app_${_helper_target}") {
      helper_name_suffix = _helper_suffix
    }
  }

  template("stripped_framework") {
    action(target_name) {
      assert(defined(invoker.framework))

      script = "//electron/build/strip_framework.py"

      forward_variables_from(invoker, [ "deps" ])
      inputs = [ "$root_out_dir/" + invoker.framework ]
      outputs = [ "$target_out_dir/stripped_frameworks/" + invoker.framework ]

      args = rebase_path(inputs) + rebase_path(outputs)
    }
  }

  stripped_framework("stripped_mantle_framework") {
    framework = "Mantle.framework"
    deps = [ "//third_party/squirrel.mac:mantle_framework" ]
  }

  stripped_framework("stripped_reactiveobjc_framework") {
    framework = "ReactiveObjC.framework"
    deps = [ "//third_party/squirrel.mac:reactiveobjc_framework" ]
  }

  stripped_framework("stripped_squirrel_framework") {
    framework = "Squirrel.framework"
    deps = [ "//third_party/squirrel.mac:squirrel_framework" ]
  }

  bundle_data("electron_app_framework_bundle_data") {
    sources = [ "$root_out_dir/$electron_framework_name.framework" ]
    if (!is_mas_build) {
      sources += get_target_outputs(":stripped_mantle_framework") +
                 get_target_outputs(":stripped_reactiveobjc_framework") +
                 get_target_outputs(":stripped_squirrel_framework")
    }
    outputs = [ "{{bundle_contents_dir}}/Frameworks/{{source_file_part}}" ]
    public_deps = [
      ":electron_framework+link",
      ":stripped_mantle_framework",
      ":stripped_reactiveobjc_framework",
      ":stripped_squirrel_framework",
    ]

    foreach(helper_params, content_mac_helpers) {
      sources +=
          [ "$root_out_dir/${electron_helper_name}${helper_params[2]}.app" ]
      public_deps += [ ":electron_helper_app_${helper_params[0]}" ]
    }
  }

  mac_app_bundle("electron_login_helper") {
    output_name = electron_login_helper_name
    sources = filenames.login_helper_sources
    include_dirs = [ "." ]
    frameworks = [ "AppKit.framework" ]
    info_plist = "shell/app/resources/mac/loginhelper-Info.plist"
    extra_substitutions =
        [ "ELECTRON_BUNDLE_ID=$electron_mac_bundle_id.loginhelper" ]
  }

  bundle_data("electron_login_helper_app") {
    public_deps = [ ":electron_login_helper" ]
    sources = [ "$root_out_dir/$electron_login_helper_name.app" ]
    outputs =
        [ "{{bundle_contents_dir}}/Library/LoginItems/{{source_file_part}}" ]
  }

  action("electron_app_lproj_dirs") {
    outputs = []

    foreach(locale, locales_as_apple_outputs) {
      outputs += [ "$target_gen_dir/app_infoplist_strings/$locale.lproj" ]
    }
    script = "build/mac/make_locale_dirs.py"
    args = rebase_path(outputs)
  }

  foreach(locale, locales_as_apple_outputs) {
    bundle_data("electron_app_strings_${locale}_bundle_data") {
      sources = [ "$target_gen_dir/app_infoplist_strings/$locale.lproj" ]
      outputs = [ "{{bundle_resources_dir}}/$locale.lproj" ]
      public_deps = [ ":electron_app_lproj_dirs" ]
    }
  }
  group("electron_app_strings_bundle_data") {
    public_deps = []
    foreach(locale, locales_as_apple_outputs) {
      public_deps += [ ":electron_app_strings_${locale}_bundle_data" ]
    }
  }

  bundle_data("electron_app_resources") {
    public_deps = [
      ":default_app_asar",
      ":electron_app_strings_bundle_data",
    ]
    sources = [
      "$root_out_dir/resources/default_app.asar",
      "shell/browser/resources/mac/electron.icns",
    ]
    outputs = [ "{{bundle_resources_dir}}/{{source_file_part}}" ]
  }

  asar_hashed_info_plist("electron_app_plist") {
    keys = [ "DEFAULT_APP_ASAR_HEADER_SHA" ]
    hash_targets = [ ":default_app_asar_header_hash" ]
    plist_file = "shell/browser/resources/mac/Info.plist"
  }

  mac_app_bundle("electron_app") {
    output_name = electron_product_name
    sources = [
      "shell/app/electron_main_mac.cc",
      "shell/app/uv_stdio_fix.cc",
      "shell/app/uv_stdio_fix.h",
    ]
    include_dirs = [ "." ]
    deps = [
      ":electron_app_framework_bundle_data",
      ":electron_app_plist",
      ":electron_app_resources",
      ":electron_fuses",
      "//base/allocator:early_zone_registration_mac",
      "//electron/buildflags",
    ]
    if (is_mas_build) {
      deps += [ ":electron_login_helper_app" ]
    }
    info_plist_target = ":electron_app_plist"
    extra_substitutions = [
      "ELECTRON_BUNDLE_ID=$electron_mac_bundle_id",
      "ELECTRON_VERSION=$electron_version",
    ]
    ldflags = [
      "-rpath",
      "@executable_path/../Frameworks",
    ]
    extra_configs = [ "//electron/build/config:mas_build" ]
  }

  if (enable_dsyms) {
    extract_symbols("electron_framework_syms") {
      binary = "$root_out_dir/$electron_framework_name.framework/Versions/$electron_framework_version/$electron_framework_name"
      symbol_dir = "$root_out_dir/breakpad_symbols"
      dsym_file = "$root_out_dir/$electron_framework_name.dSYM/Contents/Resources/DWARF/$electron_framework_name"
      deps = [ ":electron_framework" ]
    }

    foreach(helper_params, content_mac_helpers) {
      _helper_target = helper_params[0]
      _helper_bundle_id = helper_params[1]
      _helper_suffix = helper_params[2]
      extract_symbols("electron_helper_syms_${_helper_target}") {
        binary = "$root_out_dir/$electron_helper_name${_helper_suffix}.app/Contents/MacOS/$electron_helper_name${_helper_suffix}"
        symbol_dir = "$root_out_dir/breakpad_symbols"
        dsym_file = "$root_out_dir/$electron_helper_name${_helper_suffix}.dSYM/Contents/Resources/DWARF/$electron_helper_name${_helper_suffix}"
        deps = [ ":electron_helper_app_${_helper_target}" ]
      }
    }

    extract_symbols("electron_app_syms") {
      binary = "$root_out_dir/$electron_product_name.app/Contents/MacOS/$electron_product_name"
      symbol_dir = "$root_out_dir/breakpad_symbols"
      dsym_file = "$root_out_dir/$electron_product_name.dSYM/Contents/Resources/DWARF/$electron_product_name"
      deps = [ ":electron_app" ]
    }

    extract_symbols("egl_syms") {
      binary = "$root_out_dir/libEGL.dylib"
      symbol_dir = "$root_out_dir/breakpad_symbols"
      dsym_file = "$root_out_dir/libEGL.dylib.dSYM/Contents/Resources/DWARF/libEGL.dylib"
      deps = [ "//third_party/angle:libEGL" ]
    }

    extract_symbols("gles_syms") {
      binary = "$root_out_dir/libGLESv2.dylib"
      symbol_dir = "$root_out_dir/breakpad_symbols"
      dsym_file = "$root_out_dir/libGLESv2.dylib.dSYM/Contents/Resources/DWARF/libGLESv2.dylib"
      deps = [ "//third_party/angle:libGLESv2" ]
    }

    extract_symbols("crashpad_handler_syms") {
      binary = "$root_out_dir/chrome_crashpad_handler"
      symbol_dir = "$root_out_dir/breakpad_symbols"
      dsym_file = "$root_out_dir/chrome_crashpad_handler.dSYM/Contents/Resources/DWARF/chrome_crashpad_handler"
      deps = [ "//components/crash/core/app:chrome_crashpad_handler" ]
    }

    group("electron_symbols") {
      deps = [
        ":egl_syms",
        ":electron_app_syms",
        ":electron_framework_syms",
        ":gles_syms",
      ]

      if (!is_mas_build) {
        deps += [ ":crashpad_handler_syms" ]
      }

      foreach(helper_params, content_mac_helpers) {
        _helper_target = helper_params[0]
        deps += [ ":electron_helper_syms_${_helper_target}" ]
      }
    }
  } else {
    group("electron_symbols") {
    }
  }
} else {
  windows_manifest("electron_app_manifest") {
    sources = [
      "shell/browser/resources/win/disable_window_filtering.manifest",
      "shell/browser/resources/win/dpi_aware.manifest",
      as_invoker_manifest,
      common_controls_manifest,
      default_compatibility_manifest,
    ]
  }

  executable("electron_app") {
    output_name = electron_project_name
    if (is_win) {
      sources = [ "shell/app/electron_main_win.cc" ]
    } else if (is_linux) {
      sources = [
        "shell/app/electron_main_linux.cc",
        "shell/app/uv_stdio_fix.cc",
        "shell/app/uv_stdio_fix.h",
      ]
    }
    include_dirs = [ "." ]
    deps = [
      ":default_app_asar",
      ":electron_app_manifest",
      ":electron_lib",
      ":electron_win32_resources",
      ":packed_resources",
      "//components/crash/core/app",
      "//content:sandbox_helper_win",
      "//electron/buildflags",
      "//ui/strings",
    ]

    data = []
    data_deps = []

    data += [ "$root_out_dir/resources.pak" ]
    data += [ "$root_out_dir/chrome_100_percent.pak" ]
    if (enable_hidpi) {
      data += [ "$root_out_dir/chrome_200_percent.pak" ]
    }
    foreach(locale, platform_pak_locales) {
      data += [ "$root_out_dir/locales/$locale.pak" ]
    }

    if (!is_mac) {
      data += [ "$root_out_dir/resources/default_app.asar" ]
    }

    if (use_v8_context_snapshot) {
      public_deps = [ "//tools/v8_context_snapshot:v8_context_snapshot" ]
    }

    if (is_linux) {
      data_deps += [ "//components/crash/core/app:chrome_crashpad_handler" ]
    }

    if (is_win) {
      sources += [
        "$target_gen_dir/win-resources/electron.rc",
        "shell/browser/resources/win/resource.h",
      ]

      deps += [
        "//components/browser_watcher:browser_watcher_client",
        "//components/crash/core/app:run_as_crashpad_handler",
      ]

      ldflags = []

      libs = [
        "comctl32.lib",
        "uiautomationcore.lib",
        "wtsapi32.lib",
      ]

      configs -= [ "//build/config/win:console" ]
      configs += [
        "//build/config/win:windowed",
        "//build/config/win:delayloads",
      ]

      if (current_cpu == "x86") {
        # Set the initial stack size to 0.5MiB, instead of the 1.5MiB needed by
        # Chrome's main thread. This saves significant memory on threads (like
        # those in the Windows thread pool, and others) whose stack size we can
        # only control through this setting. Because Chrome's main thread needs
        # a minimum 1.5 MiB stack, the main thread (in 32-bit builds only) uses
        # fibers to switch to a 1.5 MiB stack before running any other code.
        ldflags += [ "/STACK:0x80000" ]
      } else {
        # Increase the initial stack size. The default is 1MB, this is 8MB.
        ldflags += [ "/STACK:0x800000" ]
      }

      # This is to support renaming of electron.exe. node-gyp has hard-coded
      # executable names which it will recognise as node. This module definition
      # file claims that the electron executable is in fact named "node.exe",
      # which is one of the executable names that node-gyp recognizes.
      # See https://github.com/nodejs/node-gyp/commit/52ceec3a6d15de3a8f385f43dbe5ecf5456ad07a
      ldflags += [ "/DEF:" + rebase_path("build/electron.def", root_build_dir) ]
      inputs = [
        "shell/browser/resources/win/electron.ico",
        "build/electron.def",
      ]
    }
    if (is_linux) {
      ldflags = [
        "-pie",

        # Required for exporting all symbols of libuv.
        "-Wl,--whole-archive",
        "obj/third_party/electron_node/deps/uv/libuv.a",
        "-Wl,--no-whole-archive",
      ]

      if (!is_component_build && is_component_ffmpeg) {
        configs += [ "//build/config/gcc:rpath_for_built_shared_libraries" ]
      }

      if (is_linux) {
        deps += [ "//sandbox/linux:chrome_sandbox" ]
      }
    }
  }

  if (is_official_build) {
    if (is_linux) {
      _target_executable_suffix = ""
      _target_shared_library_suffix = ".so"
    } else if (is_win) {
      _target_executable_suffix = ".exe"
      _target_shared_library_suffix = ".dll"
    }

    extract_symbols("electron_app_symbols") {
      binary = "$root_out_dir/$electron_project_name$_target_executable_suffix"
      symbol_dir = "$root_out_dir/breakpad_symbols"
      deps = [ ":electron_app" ]
    }

    extract_symbols("egl_symbols") {
      binary = "$root_out_dir/libEGL$_target_shared_library_suffix"
      symbol_dir = "$root_out_dir/breakpad_symbols"
      deps = [ "//third_party/angle:libEGL" ]
    }

    extract_symbols("gles_symbols") {
      binary = "$root_out_dir/libGLESv2$_target_shared_library_suffix"
      symbol_dir = "$root_out_dir/breakpad_symbols"
      deps = [ "//third_party/angle:libGLESv2" ]
    }

    group("electron_symbols") {
      deps = [
        ":egl_symbols",
        ":electron_app_symbols",
        ":gles_symbols",
      ]
    }
  }
}

test("shell_browser_ui_unittests") {
  sources = [
    "//electron/shell/browser/ui/accelerator_util_unittests.cc",
    "//electron/shell/browser/ui/run_all_unittests.cc",
  ]

  configs += [ ":electron_lib_config" ]

  deps = [
    ":electron_lib",
    "//base",
    "//base/test:test_support",
    "//testing/gmock",
    "//testing/gtest",
    "//ui/base",
    "//ui/strings",
  ]
}

template("dist_zip") {
  _runtime_deps_target = "${target_name}__deps"
  _runtime_deps_file =
      "$root_out_dir/gen.runtime/" + get_label_info(target_name, "dir") + "/" +
      get_label_info(target_name, "name") + ".runtime_deps"

  group(_runtime_deps_target) {
    forward_variables_from(invoker,
                           [
                             "deps",
                             "data_deps",
                             "data",
                             "testonly",
                           ])
    write_runtime_deps = _runtime_deps_file
  }

  action(target_name) {
    script = "//electron/build/zip.py"
    deps = [ ":$_runtime_deps_target" ]
    forward_variables_from(invoker,
                           [
                             "outputs",
                             "testonly",
                           ])
    flatten = false
    flatten_relative_to = false
    if (defined(invoker.flatten)) {
      flatten = invoker.flatten
      if (defined(invoker.flatten_relative_to)) {
        flatten_relative_to = invoker.flatten_relative_to
      }
    }
    args = rebase_path(outputs + [ _runtime_deps_file ], root_build_dir) + [
             target_cpu,
             target_os,
             "$flatten",
             "$flatten_relative_to",
           ]
  }
}

copy("electron_license") {
  sources = [ "LICENSE" ]
  outputs = [ "$root_build_dir/{{source_file_part}}" ]
}
copy("chromium_licenses") {
  deps = [ "//components/resources:about_credits" ]
  sources = [ "$root_gen_dir/components/resources/about_credits.html" ]
  outputs = [ "$root_build_dir/LICENSES.chromium.html" ]
}

group("licenses") {
  data_deps = [
    ":chromium_licenses",
    ":electron_license",
  ]
}

dist_zip("electron_dist_zip") {
  data_deps = [
    ":electron_app",
    ":electron_version_file",
    ":licenses",
  ]
  if (is_linux) {
    data_deps += [ "//sandbox/linux:chrome_sandbox" ]
  }
  deps = data_deps
  outputs = [ "$root_build_dir/dist.zip" ]
}

dist_zip("electron_ffmpeg_zip") {
  data_deps = [ "//third_party/ffmpeg" ]
  deps = data_deps
  outputs = [ "$root_build_dir/ffmpeg.zip" ]
}

electron_chromedriver_deps = [
  ":licenses",
  "//chrome/test/chromedriver:chromedriver_server",
  "//electron/buildflags",
]

group("electron_chromedriver") {
  testonly = true
  public_deps = electron_chromedriver_deps
}

dist_zip("electron_chromedriver_zip") {
  testonly = true
  data_deps = electron_chromedriver_deps
  deps = data_deps
  outputs = [ "$root_build_dir/chromedriver.zip" ]
}

mksnapshot_deps = [
  ":licenses",
  "//v8:mksnapshot($v8_snapshot_toolchain)",
]

if (use_v8_context_snapshot) {
  mksnapshot_deps += [ "//tools/v8_context_snapshot:v8_context_snapshot_generator($v8_snapshot_toolchain)" ]
}

group("electron_mksnapshot") {
  public_deps = mksnapshot_deps
}

dist_zip("electron_mksnapshot_zip") {
  data_deps = mksnapshot_deps
  deps = data_deps
  outputs = [ "$root_build_dir/mksnapshot.zip" ]
}

copy("hunspell_dictionaries") {
  sources = hunspell_dictionaries + hunspell_licenses
  outputs = [ "$target_gen_dir/electron_hunspell/{{source_file_part}}" ]
}

dist_zip("hunspell_dictionaries_zip") {
  data_deps = [ ":hunspell_dictionaries" ]
  deps = data_deps
  flatten = true

  outputs = [ "$root_build_dir/hunspell_dictionaries.zip" ]
}

copy("libcxx_headers") {
  sources = libcxx_headers + libcxx_licenses +
            [ "//buildtools/third_party/libc++/__config_site" ]
  outputs = [ "$target_gen_dir/electron_libcxx_include/{{source_root_relative_dir}}/{{source_file_part}}" ]
}

dist_zip("libcxx_headers_zip") {
  data_deps = [ ":libcxx_headers" ]
  deps = data_deps
  flatten = true
  flatten_relative_to = rebase_path(
          "$target_gen_dir/electron_libcxx_include/buildtools/third_party/libc++/trunk",
          "$root_out_dir")

  outputs = [ "$root_build_dir/libcxx_headers.zip" ]
}

copy("libcxxabi_headers") {
  sources = libcxxabi_headers + libcxxabi_licenses
  outputs = [ "$target_gen_dir/electron_libcxxabi_include/{{source_root_relative_dir}}/{{source_file_part}}" ]
}

dist_zip("libcxxabi_headers_zip") {
  data_deps = [ ":libcxxabi_headers" ]
  deps = data_deps
  flatten = true
  flatten_relative_to = rebase_path(
          "$target_gen_dir/electron_libcxxabi_include/buildtools/third_party/libc++abi/trunk",
          "$root_out_dir")

  outputs = [ "$root_build_dir/libcxxabi_headers.zip" ]
}

action("libcxx_objects_zip") {
  deps = [ "//buildtools/third_party/libc++" ]
  script = "build/zip_libcxx.py"
  outputs = [ "$root_build_dir/libcxx_objects.zip" ]
  args = rebase_path(outputs)
}

group("electron") {
  public_deps = [ ":electron_app" ]
}