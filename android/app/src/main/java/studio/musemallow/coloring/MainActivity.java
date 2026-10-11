package studio.musemallow.coloring;

import android.os.Bundle;
import androidx.activity.OnBackPressedCallback;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.PluginHandle;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(StudioFilesPlugin.class);
        super.onCreate(savedInstanceState);
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                PluginHandle handle = getBridge() == null ? null : getBridge().getPlugin("StudioFiles");
                if (handle == null || !((StudioFilesPlugin) handle.getInstance()).dispatchBack()) {
                    finish();
                }
            }
        });
    }
}
