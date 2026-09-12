// Local source configuration only. No generated native files or declarations.
const base = require("./app.json").expo;
function googleScheme(clientId) {
  if (!clientId) return null;
  const match = /^([0-9]+-[a-z0-9]+)\.apps\.googleusercontent\.com$/i.exec(
    clientId,
  );
  if (!match) throw new Error("Invalid public iOS Google client ID format.");
  return `com.googleusercontent.apps.${match[1]}`;
}
function buildConfig(env = process.env) {
  const scheme = googleScheme(env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID);
  const plugins = base.plugins.filter(
    (plugin) =>
      (Array.isArray(plugin) ? plugin[0] : plugin) !==
      "@react-native-google-signin/google-signin",
  );
  if (scheme)
    plugins.push([
      "@react-native-google-signin/google-signin",
      { iosUrlScheme: scheme },
    ]);
  return { ...base, plugins };
}
module.exports = () => buildConfig();
module.exports.buildConfig = buildConfig;
module.exports.googleScheme = googleScheme;
