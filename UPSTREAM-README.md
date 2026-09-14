# Basketball Quick Stats

AI-powered amateur basketball game analysis tool for extracting player statistics and highlights from video footage.

## Features

- **Video Analysis**: Upload MP4 videos of amateur basketball games and extract comprehensive statistics
- **Player Tracking**: Detect and track individual players by jersey number
- **Visual Score Detection**: Automatically detect scores by tracking ball movement through the hoop
- **Action Recognition**: Identify shots, dunks, blocks, passes, assists, rebounds, and more
- **Per-Player Statistics**: Track detailed stats for each player including points, hit rate, assists, blocks
- **Highlight Generation**: Auto-create highlight clips of key moments (dunks, 3-pointers, blocks, etc.)
- **Interactive Timeline**: Click on events to seek to specific moments in the video
- **Data Export**: Export team and player statistics as JSON or CSV files

## Technology Stack

- **Frontend**: Next.js 15, React 19, TypeScript
- **AI/ML**: TensorFlow.js, MediaPipe, Tesseract.js
- **Charts**: Recharts for data visualization
- **Processing**: Web Workers for heavy computation
- **Styling**: Tailwind CSS

## Getting Started

1. Install dependencies:

   ```bash
   npm install
   ```

2. Run the development server:

   ```bash
   npm run dev
   ```

3. Open [http://localhost:3000](http://localhost:3000) in your browser

## Usage

1. **Upload Video**: Select an MP4 video file of an amateur basketball game (up to 500MB)
2. **Configure Analysis**: Choose sampling rate and enable features:
   - Ball Detection: Track ball movement and trajectory
   - Pose Estimation: Analyze player body poses for action recognition
   - Jersey Number Detection: Identify individual players
   - 3-Point Line Detection: Distinguish 2-point from 3-point shots
3. **Start Analysis**: The system will:
   - Detect and track all players throughout the video
   - Identify jersey numbers for per-player statistics
   - Track the ball and detect when it goes through the hoop
   - Recognize actions: shots, dunks, blocks, passes, assists, layups, etc.
   - Generate highlight clips of key moments
4. **Review Results**:
   - View team and per-player statistics
   - Watch auto-generated highlight clips
   - Explore timeline with all detected events
   - Filter events by player or action type
5. **Export Data**: Download comprehensive statistics as JSON or CSV

## Recommended Video Quality (Amateur Videos)

- **Resolution**: 1080p recommended (720p minimum) for jersey number detection
- **Camera Setup**: Use tripod or stable mount showing full court and hoop
- **Hoop Visibility**: Basketball hoop must be clearly visible in frame for score detection
- **Lighting**: Good lighting helps with player detection and jersey recognition
- **Camera Angle**: Side-court or elevated view capturing full court preferred
- **Duration**: 2-10 minutes for best results
- **Video Quality**: Avoid excessive compression, motion blur, or camera shake

## Architecture

The application uses a client-side processing approach:

- **Main Thread**: UI components and user interaction
- **Web Workers**: Heavy AI/ML processing (person detection, OCR, pose estimation)
- **Models**: Pre-trained models for object detection and pose estimation
- **Event Fusion**: Rule-based system to combine detection results into game events

## Development Status

Current implementation includes:

- ✅ Basic UI and video player
- ✅ Video upload and frame extraction
- ✅ Processing controls and progress tracking
- ✅ Player detection and team clustering
- ✅ Visual score detection (ball-through-hoop tracking)
- ✅ Jersey number detection and player tracking
- ✅ Enhanced action recognition (blocks, dunks, passes, assists, layups, etc.)
- ✅ Per-player statistics generation
- ✅ Highlight clip extraction and filtering
- ✅ Results display with charts and timeline
- ✅ Tooltips and help system
- ✅ Video quality checker
- ✅ Performance monitoring
- ✅ Test infrastructure and evaluation framework
- 🚧 Camera calibration for improved 3-point detection (in progress)
- 🚧 Advanced player re-identification algorithms (in progress)

## Testing

The application includes a comprehensive testing framework for evaluating detection accuracy:

### Running Tests

```bash
# Run test evaluation suite
npm run test:eval

# Run with specific configuration
npm run test:eval -- --verbose
```

### Test Coverage

- **Annotated test clips** with ground truth data (amateur basketball footage)
- **Accuracy metrics**: Precision, recall, F1 scores for all event types
- **Performance benchmarks**: Processing time and memory usage
- **Quality thresholds**:
  - Visual score detection ≥70%
  - Team attribution ≥80%
  - Action detection (shots, rebounds, blocks, etc.) ≥60-70%
  - Jersey number recognition ≥75% when visible

See [TESTING.md](./TESTING.md) for detailed testing documentation.

## Performance

The application is optimized for client-side processing:

- **Web Workers** isolate heavy computation from UI thread
- **Lazy model loading** reduces initial bundle size
- **Device capability detection** auto-adjusts settings
- **Quality checker** warns about suboptimal footage
- **Configurable sampling rates** balance accuracy vs. speed

### Performance Targets

- Process 2-minute 1080p clip at 1 FPS without freezing UI
- Models loaded lazily on demand
- Responsive design for all screen sizes
- Export functionality works for large datasets

## Help & Documentation

Click the help button (?) in the bottom-right corner of the app for:

- **Quick Start Guide**: Step-by-step usage instructions
- **FAQ & Troubleshooting**: Common issues and solutions
- **Privacy Information**: Data handling and security details

## License

MIT License
