#if MELONLOADER
using BepInEx.Logging;
using MelonLoader;

[assembly: MelonInfo(typeof(PackViewerInVersus.MelonPackViewerInVersusMod), "Pack Viewer In Versus", "0.1.2", "SAP Library Extension")]
[assembly: MelonGame("Team Wood", "Super Auto Pets")]

namespace PackViewerInVersus;

public sealed class MelonPackViewerInVersusMod : MelonMod
{
    private ManualLogSource _logger;

    public override void OnInitializeMelon()
    {
        _logger = new ManualLogSource(LoggerInstance);
        MainThreadUiTick.Logger = _logger;
        OverlayButtonInstaller.Logger = _logger;
        _logger.LogInfo("Loaded MelonLoader mod. Pack-viewer logic will run from MelonMod.OnUpdate().");
    }

    public override void OnUpdate()
    {
        if (_logger == null)
        {
            return;
        }

        MainThreadUiTick.Tick(this);
    }
}
#endif
