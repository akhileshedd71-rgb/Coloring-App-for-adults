package studio.musemallow.coloring;

import android.content.ClipData;
import android.content.Intent;
import android.net.Uri;
import android.util.Base64;
import androidx.core.content.FileProvider;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.util.Locale;

/** Small, local-only native bridge. No media/storage permission is required. */
@CapacitorPlugin(name = "StudioFiles")
public class StudioFilesPlugin extends Plugin {
    @PluginMethod
    public void shareImage(PluginCall call) {
        String encoded = call.getString("base64", "");
        String mime = call.getString("mime", "image/png");
        if (!(mime.equals("image/png") || mime.equals("image/jpeg"))) {
            call.reject("Only PNG and JPEG images can be shared.");
            return;
        }
        if (encoded.isEmpty() || encoded.length() > 48 * 1024 * 1024) {
            call.reject("The image is empty or too large to share.");
            return;
        }
        try {
            File directory = new File(getContext().getCacheDir(), "exports");
            if (!directory.exists() && !directory.mkdirs()) throw new IOException("Cannot create export folder");
            File[] previous = directory.listFiles();
            if (previous != null) {
                long cutoff = System.currentTimeMillis() - 24L * 60 * 60 * 1000;
                for (File file : previous) if (file.isFile() && file.lastModified() < cutoff) file.delete();
            }
            String basename = call.getString("filename", "Musemallow-artwork").replaceAll("[^a-zA-Z0-9._-]", "_");
            if (basename.length() > 100) basename = basename.substring(0, 100);
            String extension = mime.equals("image/jpeg") ? ".jpg" : ".png";
            if (!basename.toLowerCase(Locale.ROOT).endsWith(extension)) basename += extension;
            File output = new File(directory, System.currentTimeMillis() + "-" + basename);
            byte[] bytes = Base64.decode(encoded, Base64.DEFAULT);
            try (FileOutputStream stream = new FileOutputStream(output)) {
                stream.write(bytes);
            }
            Uri uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", output);
            Intent send = new Intent(Intent.ACTION_SEND);
            send.setType(mime);
            send.putExtra(Intent.EXTRA_STREAM, uri);
            send.setClipData(ClipData.newRawUri("Musemallow artwork", uri));
            send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            Intent chooser = Intent.createChooser(send, "Share your artwork");
            chooser.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            getActivity().runOnUiThread(() -> {
                try {
                    getActivity().startActivity(chooser);
                    call.resolve();
                } catch (Exception error) {
                    call.reject("No app is available to receive this image.", error);
                }
            });
        } catch (Exception error) {
            call.reject("Could not save the image for sharing. Check available storage and try again.", error);
        }
    }

    public boolean dispatchBack() {
        if (!hasListeners("back")) return false;
        notifyListeners("back", new JSObject());
        return true;
    }

    @Override
    protected void handleOnPause() {
        notifyListeners("pause", new JSObject());
    }

    @PluginMethod
    public void exit(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            call.resolve();
            getActivity().finish();
        });
    }
}
